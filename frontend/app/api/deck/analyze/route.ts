// app/api/deck/analyze/route.ts

import fs from "node:fs/promises";
import path from "node:path";
import {
  type SfCard,
  type InferredDeckContext,
  fetchCard,
  checkIfCommander,
  inferDeckContext,
  fetchCardsBatch,
} from "@/lib/deck/inference";
import { getActivePromptVersion } from "@/lib/config/prompts";
import { COMMANDER_PROFILES } from "@/lib/deck/archetypes";
import {
  CardSuggestion,
  isWithinColorIdentity,
  matchesRequestedType,
  isLegalForFormat,
  isDuplicate,
  normalizeCardName,
} from "@/lib/deck/mtgValidators";

export const runtime = "nodejs";

// Commander-only cards that should not be suggested for non-Commander formats
const COMMANDER_ONLY_CARDS = [
  'Sol Ring',
  'Command Tower',
  'Arcane Signet',
  'Commander Sphere',
  'Commander Plate',
  'The Great Henge',
  'Rhystic Study',
  'Smothering Tithe',
  'Mystic Remora',
  'Dockside Extortionist',
  'Fierce Guardianship',
  'Deadly Rollick',
  'Flawless Maneuver',
  'Deflecting Swat',
  'Teferi\'s Protection',
  'Guardian Project',
  'Beast Whisperer',
  'Kindred Discovery',
  'Path of Ancestry',
  'Exotic Orchard',
  'Reflecting Pool',
];

// Prompt Version: Configurable for A/B testing (see getActivePromptVersion() usage below)

type SuggestionSlotPlan = {
  role: string;
  requestedType?: string;
  colors?: string[];
  notes?: string;
  quantity?: number;
};

type SlotCandidate = {
  name: string;
  reason?: string;
};

type FilledSlot = SuggestionSlotPlan & {
  candidates: SlotCandidate[];
};

type ValidatedSuggestion = CardSuggestion & {
  slotRole: string;
  requestedType?: string;
};

type FilteredCandidate = {
  slotRole: string;
  name: string;
  reason: string;
  source: "gpt" | "retry";
};

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  {
    temperature = 0.3,
    maxTokens = 600,
  }: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw Object.assign(new Error("OpenAI API key not configured"), { code: "missing_api_key" });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
      ],
      temperature,
      max_output_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `HTTP ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status });
  }

  const body = await response.json().catch(() => ({}));
  return String(body?.output_text ?? "").trim();
}

function extractJsonObject(raw: string): any | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function planSuggestionSlots(
  deckText: string,
  userMessage: string | undefined,
  context: InferredDeckContext
): Promise<SuggestionSlotPlan[]> {
  const promptVersion = getActivePromptVersion();
  const profile = context.commander ? COMMANDER_PROFILES[context.commander] ?? null : null;

  const systemPrompt = [
    "You are ManaTap's planning assistant. Before naming cards, decide what kinds of improvements the deck needs.",
    "Always respond with STRICT JSON. No narration.",
    `Prompt version: ${promptVersion}-planner`,
  ].join("\n");

  const profileNotes = profile
    ? [
        profile.mustBePermanent ? "- Recommended cards should be permanents for this commander." : "",
        profile.preferTags && profile.preferTags.length
          ? `- Consider cards with these patterns: ${profile.preferTags.join(", ")}.`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const userPrompt = [
    `Deck format: ${context.format}`,
    `Deck colors: ${context.colors.join(", ") || "Colorless"}`,
    context.commander ? `Commander: ${context.commander}` : "Commander: none provided",
    profileNotes ? `Commander profile notes:\n${profileNotes}` : "",
    context.userIntent ? `User goal: ${context.userIntent}` : "",
    context.archetype ? `Detected archetype: ${context.archetype}` : "",
    context.powerLevel ? `Power level: ${context.powerLevel}` : "",
    userMessage ? `User message:\n${userMessage}` : "User message: (none)",
    "Decklist:",
    deckText,
    "",
    "Plan 3-6 suggestion slots. Each slot describes the job to be done (ramp, interaction, recursion, finishers, meta tech, etc.) and preferred card type.",
    "Return JSON exactly: {\"slots\":[{\"role\":\"...\",\"requestedType\":\"permanent|instant|any|...\",\"colors\":[\"R\",\"G\"],\"notes\":\"short justification\",\"quantity\":1}]}",
    "requestedType and colors are optional; omit when flexible. Notes should be concise.",
  ].join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callOpenAI(systemPrompt, userPrompt, { temperature: 0.2, maxTokens: 400 });
      const parsed = extractJsonObject(raw);
      const slots = Array.isArray(parsed?.slots) ? parsed.slots : [];
      if (slots.length > 0) {
        return slots.slice(0, 8).map((slot: any) => ({
          role: String(slot?.role || "").trim() || "optional",
          requestedType: slot?.requestedType ? String(slot.requestedType) : undefined,
          colors: Array.isArray(slot?.colors)
            ? slot.colors.map((c: string) => String(c).toUpperCase())
            : undefined,
          notes: slot?.notes ? String(slot.notes) : undefined,
          quantity: Number.isFinite(slot?.quantity) ? Number(slot.quantity) : undefined,
        }));
      }
    } catch (error: any) {
      if (error?.code === "missing_api_key") {
        return [];
      }
      if (attempt === 1) throw error;
    }
  }

  return [];
}

async function fetchSlotCandidates(
  slot: SuggestionSlotPlan,
  context: InferredDeckContext,
  deckText: string,
  userMessage: string | undefined
): Promise<SlotCandidate[]> {
  const promptVersion = getActivePromptVersion();

  const systemPrompt = [
    "You are ManaTap's slot-filling assistant. Suggest specific Magic: The Gathering cards for the given role.",
    "Always return STRICT JSON. Include short synergy reasons.",
    `Prompt version: ${promptVersion}-slot`,
  ].join("\n");

  const userPrompt = [
    `Deck format: ${context.format}`,
    `Deck colors: ${context.colors.join(", ") || "Colorless"}`,
    context.commander ? `Commander: ${context.commander}` : "Commander: none provided",
    slot.requestedType ? `Requested type: ${slot.requestedType}` : "Requested type: any",
    slot.colors ? `Slot colors: ${slot.colors.join(", ")}` : "Slot colors: use deck colors",
    slot.role ? `Slot role: ${slot.role}` : "",
    slot.notes ? `Slot notes: ${slot.notes}` : "",
    context.userIntent ? `User intent: ${context.userIntent}` : "",
    userMessage ? `User message:\n${userMessage}` : "User message: (none)",
    "Decklist:",
    deckText,
    "",
    "Return JSON exactly: {\"candidates\":[{\"name\":\"Card Name\",\"reason\":\"short phrase\"}, ...]}",
    "All cards must be legal in the deck's format, within the color identity, and synergistic with the plan/commander.",
    "Prefer on-plan permanents if requested. Avoid cards already in the decklist.",
  ].join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callOpenAI(systemPrompt, userPrompt, { temperature: 0.4, maxTokens: 450 });
      const parsed = extractJsonObject(raw);
      const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
      if (candidates.length > 0) {
        return candidates
          .slice(0, 3)
          .map((candidate: any) => ({
            name: String(candidate?.name || "").trim(),
            reason: candidate?.reason ? String(candidate.reason) : undefined,
          }))
          .filter((c) => c.name);
      }
    } catch (error: any) {
      if (error?.code === "missing_api_key") {
        return [];
      }
      if (attempt === 1) throw error;
    }
  }

  return [];
}

async function fillSuggestionSlots(
  slots: SuggestionSlotPlan[],
  context: InferredDeckContext,
  deckText: string,
  userMessage: string | undefined
): Promise<FilledSlot[]> {
  const filled: FilledSlot[] = [];
  for (const slot of slots) {
    const candidates = await fetchSlotCandidates(slot, context, deckText, userMessage);
    filled.push({ ...slot, candidates });
  }
  return filled;
}

async function retrySlotCandidates(
  slot: SuggestionSlotPlan,
  context: InferredDeckContext,
  deckText: string,
  userMessage: string | undefined
): Promise<SlotCandidate[]> {
  const promptVersion = getActivePromptVersion();
  const systemPrompt = [
    "You are ManaTap's strict deck assistant.",
    "Previous ideas were filtered for being off-color, illegal, or wrong card type.",
    "Return STRICT JSON with replacements only.",
    `Prompt version: ${promptVersion}-retry`,
  ].join("\n");

  const colorLine =
    slot.colors && slot.colors.length > 0
      ? `exactly within colors ${slot.colors.join(", ")}`
      : `exactly within deck colors (${context.colors.join(", ") || "colorless"})`;

  const typeLine = slot.requestedType ? ` and card type ${slot.requestedType}` : "";

  const userPrompt = [
    `Deck format: ${context.format}`,
    `Deck colors: ${context.colors.join(", ") || "Colorless"}`,
    context.commander ? `Commander: ${context.commander}` : "Commander: none provided",
    `Slot role: ${slot.role}`,
    `Strict requirement: cards must be ${colorLine}${typeLine}.`,
    "Provide up to 5 legal, on-plan replacements with short synergy reasons.",
    userMessage ? `User message:\n${userMessage}` : "User message: (none)",
    "Decklist:",
    deckText,
    "",
    "Return JSON exactly: {\"candidates\":[{\"name\":\"Card Name\",\"reason\":\"short phrase\"}, ...]}",
  ].join("\n");

  try {
    const raw = await callOpenAI(systemPrompt, userPrompt, { temperature: 0.25, maxTokens: 450 });
    const parsed = extractJsonObject(raw);
    const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    return candidates
      .slice(0, 5)
      .map((candidate: any) => ({
        name: String(candidate?.name || "").trim(),
        reason: candidate?.reason ? String(candidate.reason) : undefined,
      }))
      .filter((c) => c.name);
  } catch (error: any) {
    if (error?.code === "missing_api_key") {
      return [];
    }
    return [];
  }
}

async function validateFilledSlots(
  filledSlots: FilledSlot[],
  context: InferredDeckContext,
  deckEntries: Array<{ count: number; name: string }>,
  byName: Map<string, SfCard>,
  deckText: string,
  userMessage: string | undefined
): Promise<{ suggestions: ValidatedSuggestion[]; filtered: FilteredCandidate[]; requiredCount: number; filledCount: number }> {
  const suggestions: ValidatedSuggestion[] = [];
  const filtered: FilteredCandidate[] = [];
  const deckNormalized = new Set(deckEntries.map((entry) => normalizeCardName(entry.name)));
  const selectedNormalized = new Set<string>();
  const profile = context.commander ? COMMANDER_PROFILES[context.commander] ?? null : null;
  const isCommanderFormat = context.format === "Commander";

  const evaluateCandidates = async (
    slot: SuggestionSlotPlan,
    candidates: SlotCandidate[],
    source: "gpt" | "retry",
    needOverride?: number
  ): Promise<number> => {
    const required = Math.max(1, needOverride ?? slot.quantity ?? 1);
    let picked = 0;
    const slotAllowedColors =
      slot.colors && slot.colors.length > 0 ? slot.colors : context.colors;
    const normalizedAllowed =
      slotAllowedColors && slotAllowedColors.length > 0
        ? slotAllowedColors.map((c) => c.toUpperCase())
        : context.colors.length > 0
        ? context.colors.map((c) => c.toUpperCase())
        : ["C"];

    for (const candidate of candidates) {
      if (picked >= required) break;
      const normalizedName = normalizeCardName(candidate.name);
      if (!candidate.name || !normalizedName) {
        filtered.push({
          slotRole: slot.role,
          name: candidate.name || "(empty)",
          reason: "missing name",
          source,
        });
        continue;
      }

      if (selectedNormalized.has(normalizedName)) {
        filtered.push({
          slotRole: slot.role,
          name: candidate.name,
          reason: "already selected for another slot",
          source,
        });
        continue;
      }

      if (isDuplicate(candidate.name, deckNormalized)) {
        filtered.push({
          slotRole: slot.role,
          name: candidate.name,
          reason: "already in deck",
          source,
        });
        continue;
      }

      const lookupKey = candidate.name.toLowerCase();
      let card = byName.get(lookupKey);
      if (!card) {
        card = await fetchCard(candidate.name);
        if (card) {
          byName.set(card.name.toLowerCase(), card);
        }
      }
      if (!card) {
        filtered.push({
          slotRole: slot.role,
          name: candidate.name,
          reason: "card lookup failed",
          source,
        });
        continue;
      }

      if (!isCommanderFormat && COMMANDER_ONLY_CARDS.includes(card.name)) {
        filtered.push({
          slotRole: slot.role,
          name: card.name,
          reason: "commander-only card in non-Commander format",
          source,
        });
        continue;
      }

      if (!isWithinColorIdentity(card, normalizedAllowed)) {
        filtered.push({
          slotRole: slot.role,
          name: card.name,
          reason: "off-color identity",
          source,
        });
        continue;
      }

      if (!isLegalForFormat(card, context.format)) {
        filtered.push({
          slotRole: slot.role,
          name: card.name,
          reason: `illegal in ${context.format}`,
          source,
        });
        continue;
      }

      if (profile?.mustBePermanent && !matchesRequestedType(card, "permanent")) {
        filtered.push({
          slotRole: slot.role,
          name: card.name,
          reason: "commander requires permanents",
          source,
        });
        continue;
      }

      if (slot.requestedType && slot.requestedType.toLowerCase() !== "any") {
        if (!matchesRequestedType(card, slot.requestedType)) {
          filtered.push({
            slotRole: slot.role,
            name: card.name,
            reason: `expected type ${slot.requestedType}`,
            source,
          });
          continue;
        }
      }

      suggestions.push({
        name: card.name,
        reason: candidate.reason,
        source,
        requestedType: slot.requestedType,
        slotRole: slot.role,
      });
      selectedNormalized.add(normalizedName);
      deckNormalized.add(normalizedName);
      picked += 1;
    }

    return picked;
  };

  const missingSlots: Array<{ slot: SuggestionSlotPlan; needed: number }> = [];
  let totalRequired = 0;

  for (const slot of filledSlots) {
    const required = Math.max(1, slot.quantity ?? 1);
    totalRequired += required;
    const picked = await evaluateCandidates(slot, slot.candidates, "gpt");
    if (picked < required) {
      missingSlots.push({ slot, needed: required - picked });
    }
  }

  const filledCount = suggestions.length;
  const threshold = Math.ceil(totalRequired * 0.4);

  if (filledCount < threshold && missingSlots.length > 0) {
    for (const { slot, needed } of missingSlots) {
      const retryCandidates = await retrySlotCandidates(slot, context, deckText, userMessage);
      if (retryCandidates.length === 0) continue;
      await evaluateCandidates(slot, retryCandidates, "retry", needed);
    }
  }

// Helper: Check if land produces colors outside allowed colors
function checkLandColors(card: SfCard, allowedColors: Set<string>): boolean {
  const typeLine = (card.type_line || '').toLowerCase();
  const oracleText = (card.oracle_text || '').toLowerCase();
  
  // If not a land, skip this check
  if (!/land/i.test(typeLine)) return true;
  
  // Check color_identity first
  const cardColors = (card.color_identity || []).map(c => c.toUpperCase());
  if (cardColors.length > 0) {
    const hasOffColor = cardColors.some(c => !allowedColors.has(c));
    if (hasOffColor) return false;
  }
  
  // Check what colors the land produces from oracle text
  const producedColors = new Set<string>();
  
  // Check for "add {W/U/B/R/G}" patterns
  const addManaRe = /add\s+\{([WUBRG])\}/gi;
  let match;
  while ((match = addManaRe.exec(oracleText)) !== null) {
    producedColors.add(match[1].toUpperCase());
  }
  
  // Check for "tapped" lands that produce specific colors
  if (/tapped/i.test(oracleText)) {
    // Panoramas and fetch lands: check what they can fetch
    if (/panorama/i.test(card.name)) {
      // Extract color words from name (e.g., "Jund Panorama" -> B, R, G)
      const nameLower = card.name.toLowerCase();
      // Shards (3-color combinations)
      if (nameLower.includes('jund')) {
        producedColors.add('B');
        producedColors.add('R');
        producedColors.add('G');
      }
      if (nameLower.includes('naya')) {
        producedColors.add('W');
        producedColors.add('R');
        producedColors.add('G');
      }
      if (nameLower.includes('bant')) {
        producedColors.add('W');
        producedColors.add('U');
        producedColors.add('G');
      }
      if (nameLower.includes('esper')) {
        producedColors.add('W');
        producedColors.add('U');
        producedColors.add('B');
      }
      if (nameLower.includes('grixis')) {
        producedColors.add('U');
        producedColors.add('B');
        producedColors.add('R');
      }
      // Wedges (2+1 color combinations)
      if (nameLower.includes('abzan')) {
        producedColors.add('W');
        producedColors.add('B');
        producedColors.add('G');
      }
      if (nameLower.includes('jeskai')) {
        producedColors.add('W');
        producedColors.add('U');
        producedColors.add('R');
      }
      if (nameLower.includes('sultai')) {
        producedColors.add('U');
        producedColors.add('B');
        producedColors.add('G');
      }
      if (nameLower.includes('mardu')) {
        producedColors.add('W');
        producedColors.add('B');
        producedColors.add('R');
      }
      if (nameLower.includes('temur')) {
        producedColors.add('U');
        producedColors.add('R');
        producedColors.add('G');
      }
    }
    
    // Fetch lands: check oracle text for what they can fetch
    if (/fetch|search.*library.*land/i.test(oracleText)) {
      // Check for "Mountain or Forest", "Plains or Island", etc.
      const landTypes = ['plains', 'island', 'swamp', 'mountain', 'forest'];
      const colorMap: Record<string, string> = {
        plains: 'W',
        island: 'U',
        swamp: 'B',
        mountain: 'R',
        forest: 'G',
      };
      for (const landType of landTypes) {
        if (new RegExp(landType, 'i').test(oracleText)) {
          producedColors.add(colorMap[landType]);
        }
      }
    }
  }
  
  // Check basic lands
  if (/plains/i.test(card.name)) producedColors.add('W');
  if (/island/i.test(card.name)) producedColors.add('U');
  if (/swamp/i.test(card.name)) producedColors.add('B');
  if (/mountain/i.test(card.name)) producedColors.add('R');
  if (/forest/i.test(card.name)) producedColors.add('G');
  
  // If land produces colors, all must be in allowed colors
  if (producedColors.size > 0) {
    for (const color of producedColors) {
      if (!allowedColors.has(color)) return false;
    }
  }
  
  return true;
}

function extractManaColors(manaCost: string | undefined): Set<string> {
  const colors = new Set<string>();
  if (!manaCost) return colors;
  const symbolRe = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = symbolRe.exec(manaCost)) !== null) {
    const symbol = match[1].toUpperCase();
    const letters = symbol.match(/[WUBRG]/g);
    if (letters) {
      letters.forEach((letter) => colors.add(letter));
    }
  }
  return colors;
}

function hasDoublePip(manaCost: string | undefined): boolean {
  if (!manaCost) return false;
  const counts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const symbolRe = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = symbolRe.exec(manaCost)) !== null) {
    const symbol = match[1].toUpperCase();
    const letters = symbol.match(/[WUBRG]/g);
    if (letters) {
      for (const letter of letters) {
        counts[letter] = (counts[letter] || 0) + 1;
        if (counts[letter] >= 2) return true;
      }
    }
  }
  return false;
}

// Helper: Check if card actually draws/loots/rummages/impulses
function isRealDrawOrFilter(card: SfCard): boolean {
  const oracleText = (card.oracle_text || '').toLowerCase();
  
  // Check for actual draw effects
  if (/draw a card|draw.*cards|draw equal to/i.test(oracleText)) return true;
  
  // Check for looting (draw then discard)
  if (/draw.*card.*discard|draw.*then discard/i.test(oracleText)) return true;
  
  // Check for rummaging (discard then draw)
  if (/discard.*card.*draw|discard.*then draw/i.test(oracleText)) return true;
  
  // Check for impulse draw (exile and cast)
  if (/exile.*cards.*cast|exile.*top.*cast|look at.*exile.*cast/i.test(oracleText)) return true;
  
  // Check for "look at" / "reveal" that lets you take cards
  if (/look at.*top.*put.*into|reveal.*top.*put.*into|look at.*choose.*put/i.test(oracleText)) return true;
  
  // Check for scry (filtering, not draw, but counts as card quality improvement)
  if (/scry [0-9]/i.test(oracleText)) return true;
  
  return false;
}

// Helper: Check if card is generic ramp
function isGenericRamp(cardName: string): boolean {
  const nameLower = cardName.toLowerCase();
  const genericRamp = [
    // Land ramp
    'cultivate',
    "kodama's reach",
    'rampant growth',
    'farseek',
    "nature's lore",
    'three visits',
    'sakura-tribe elder',
    'wood elves',
    'farhaven elf',
    'solemn simulacrum',
    // Generic mana rocks
    'arcane signet',
    'sol ring',
    'emerald medallion',
    'sapphire medallion',
    'jet medallion',
    'ruby medallion',
    'pearl medallion',
    'thought vessel',
    'mind stone',
    'fellwar stone',
    'prismatic lens',
    'star compass',
    'commander sphere',
    'guardian idol',
    'coldsteel heart',
    'firemind vessel',
    'honed edge',
  ];
  return genericRamp.some(ramp => nameLower.includes(ramp));
}

// Helper: Check if card is a board wipe that might harm the deck's plan
function isHarmfulBoardWipe(card: SfCard, context: InferredDeckContext): boolean {
  const oracleText = (card.oracle_text || '').toLowerCase();
  const typeLine = (card.type_line || '').toLowerCase();
  const nameLower = card.name.toLowerCase();
  
  // Check if it's a board wipe
  const isBoardWipe = 
    /destroy all (creatures|permanents|nonland|artifacts|enchantments)/i.test(oracleText) ||
    /exile all (creatures|permanents|nonland)/i.test(oracleText) ||
    /all (creatures|permanents|nonland) get -[0-9]/i.test(oracleText) ||
    /damage to each (creature|permanent|nonland)/i.test(oracleText) ||
    /wrath|damnation|terminus|doomsday/i.test(nameLower) ||
    /board wipe|sweeper/i.test(nameLower);
  
  if (!isBoardWipe) return false;
  
  // Check if deck is creature-heavy (token/sac/aristocrats archetype)
  if (context.archetype === 'token_sac' || context.archetype === 'aristocrats') {
    return true; // Harmful to creature-heavy decks
  }
  
  // Check if deck has many creatures (from role distribution)
  const creatureCount = context.roleDistribution?.byRole.engine_enabler || 0;
  const tokenProducers = context.roleDistribution?.cardRoles.filter(c => 
    c.roles.includes('engine_enabler') && 
    /create|token|1\/1|2\/2/i.test((c.name || '').toLowerCase())
  ).length || 0;
  
  // If deck has many creatures or token producers, board wipes are harmful
  if (creatureCount > 10 || tokenProducers > 3) {
    return true;
  }
  
  return false;
}

async function postFilterSuggestions(
  suggestions: Array<{ card: string; reason: string; category?: string }>,
  context: InferredDeckContext,
  byName: Map<string, SfCard>,
  currency: string = 'USD',
  deckEntries: Array<{ count: number; name: string }> = [],
  userId: string | null = null
): Promise<Array<{ card: string; reason: string; category?: string; id?: string; needs_review?: boolean }>> {
  let allowedColors = new Set(context.colors.map(c => c.toUpperCase()));
  if (allowedColors.size === 0) {
    allowedColors = new Set(['C']);
  }
  const filtered: Array<{ card: string; reason: string; category?: string; id?: string; needs_review?: boolean }> = [];
  const removalReasons = new Set<string>();
  
  // Normalize deck entry names for deduplication
  const normalizedDeckNames = new Set(
    deckEntries.map(e => normalizeCardName(e.name))
  );

  const wantsBudgetChecks = context.isBudget || context.budgetCapPerCard !== undefined || context.budgetTotalCap !== undefined;
  const priceMap: Map<string, number> = new Map();
  let deckPriceTotal = 0;
  let deckPricedCardCount = 0;
  let deckAveragePrice = 0;

  if (wantsBudgetChecks) {
    try {
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();

      const suggestionNames = suggestions.map((s) => s.card.toLowerCase().trim()).filter(Boolean);
      const deckNames = deckEntries.map((d) => d.name.toLowerCase().trim()).filter(Boolean);
      const uniqueNames = Array.from(new Set([...suggestionNames, ...deckNames]));

      if (uniqueNames.length > 0) {
        const { data: priceRows } = await supabase
          .from('price_cache')
          .select('name, usd, eur, gbp')
          .in('name', uniqueNames);

        if (priceRows) {
          const pickPrice = (row: { usd?: number | null; eur?: number | null; gbp?: number | null }): number | undefined => {
            if (currency === 'EUR') return row.eur ?? undefined;
            if (currency === 'GBP') return row.gbp ?? undefined;
            return row.usd ?? undefined;
          };

          const normalizedPriceMap = new Map<string, number>();
          for (const row of priceRows) {
            const key = row.name?.toLowerCase?.() ?? '';
            if (!key) continue;
            const price = pickPrice(row);
            if (price !== undefined && price >= 0) {
              normalizedPriceMap.set(key, price);
            }
          }

          // Populate suggestion price map
          for (const name of suggestionNames) {
            if (normalizedPriceMap.has(name)) {
              priceMap.set(name, normalizedPriceMap.get(name)!);
            }
          }

          // Compute deck price estimates
          for (const entry of deckEntries) {
            const norm = entry.name.toLowerCase().trim();
            const price = normalizedPriceMap.get(norm);
            if (price !== undefined && price > 0) {
              deckPriceTotal += price * entry.count;
              deckPricedCardCount += entry.count;
            }
          }

          if (deckPricedCardCount > 0) {
            deckAveragePrice = deckPriceTotal / deckPricedCardCount;
          }
        }
      }
    } catch (error) {
      console.warn('[filter] Failed to fetch prices for budget filtering:', error);
    }
  }

  if (wantsBudgetChecks && deckPriceTotal > 0) {
    context.deckPriceEstimate = deckPriceTotal;
    if (typeof context.budgetTotalCap === 'number') {
      context.budgetHeadroom = context.budgetTotalCap - deckPriceTotal;
    }
  }

  const budgetPerCardCap = context.budgetCapPerCard ?? (context.isBudget ? 10 : undefined);
  const budgetTotalCap = typeof context.budgetTotalCap === 'number' ? context.budgetTotalCap : undefined;
  const requiresPriceData = budgetPerCardCap !== undefined || budgetTotalCap !== undefined;

  filterLoop: for (const suggestion of suggestions) {
    try {
      // VERIFY CARD EXISTS: Drop hallucinated card names
      // First try exact match, then try normalized
      let card = byName.get(suggestion.card.toLowerCase());
      
      // If not found, try normalized name lookup
      if (!card) {
        const normalized = normalizeCardName(suggestion.card);
        // Try to find by iterating through map keys
        for (const [key, value] of byName.entries()) {
          if (normalizeCardName(key) === normalized) {
            card = value;
            break;
          }
        }
      }
      
      // If still not found, try fetching from Scryfall
      if (!card) {
        const fetchedCard = await fetchCard(suggestion.card);
        if (fetchedCard) {
          card = fetchedCard;
          byName.set(fetchedCard.name.toLowerCase(), fetchedCard);
        }
      }
      
      // If still not found, this is likely a hallucinated card name - mark for review but don't drop
      // (we'll let it through but flag it so frontend can show a warning)
      if (!card) {
        console.log(`[filter] Dropped ${suggestion.card}: card lookup failed (likely hallucinated)`);
        removalReasons.add('card lookup failed');
        continue;
      }

      // Ensure we have up-to-date legality info for format checks
      if (context.format !== "Commander") {
        const legalityKey = context.format.toLowerCase();
        const existingLegality = card.legalities ? card.legalities[legalityKey] : undefined;
        if (typeof existingLegality !== 'string') {
          const refreshed = await fetchCard(card.name);
          const refreshedLegality = refreshed?.legalities ? refreshed.legalities[legalityKey] : undefined;
          if (refreshed && typeof refreshedLegality === 'string') {
            card = refreshed;
            byName.set(refreshed.name.toLowerCase(), refreshed);
          } else {
            console.log(`[filter] Dropped ${suggestion.card}: legality data unavailable for ${context.format}`);
            removalReasons.add('format data unavailable');
            continue;
          }
        }
      }

      // At this point, card is guaranteed to be defined (not null/undefined)
      // STRICT COLOR FILTERING: Remove any card with colors outside allowed colors
      // Even if partially shared (e.g., Lightning Helix in Mono-Red)
      const cardColors = (card.color_identity || []).map(c => c.toUpperCase());
      const hasOffColor = cardColors.length > 0 && cardColors.some(c => !allowedColors.has(c));
      
      if (hasOffColor) {
        removalReasons.add('off-color identity');
        console.log(`[filter] Removed ${suggestion.card}: off-color (${cardColors.join(',')} not in ${Array.from(allowedColors).join(',')})`);
        continue;
      }
      
      // For colorless cards, allow them (they don't have color identity)
      // But if they have mana costs with colors, check those too
      const manaCostColors = extractManaColors(card.mana_cost);
      for (const color of manaCostColors) {
        if (!allowedColors.has(color)) {
          removalReasons.add('off-color mana cost');
          console.log(`[filter] Removed ${suggestion.card}: mana cost includes off-color (${color})`);
          continue filterLoop;
        }
      }
      
      // Special check for lands: verify they produce allowed colors
      const typeLine = (card.type_line || '').toLowerCase();
      if (/land/i.test(typeLine)) {
        const landColorsOk = checkLandColors(card, allowedColors);
        if (!landColorsOk) {
          removalReasons.add('off-color land');
          console.log(`[filter] Removed ${suggestion.card}: off-color land (produces colors outside deck)`);
          continue;
        }
      }

      // Check for duplicate cards (already in deck) - using normalized names
      const cardNameNormalized = normalizeCardName(suggestion.card);
      if (normalizedDeckNames.has(cardNameNormalized)) {
        removalReasons.add('duplicate');
        console.log(`[filter] Removed ${suggestion.card}: already in deck (normalized match)`);
        continue;
      }

      // Check for Commander-only cards in non-Commander formats
      if (context.format !== "Commander") {
        const normalizedCardName = normalizeCardName(suggestion.card);
        const isCommanderOnly = COMMANDER_ONLY_CARDS.some(cmdCard => {
          const normalizedCmdCard = normalizeCardName(cmdCard);
          return normalizedCardName === normalizedCmdCard || normalizedCardName.includes(normalizedCmdCard);
        });
        if (isCommanderOnly) {
          removalReasons.add('format restriction');
          console.log(`[filter] Removed ${suggestion.card}: Commander-only card in ${context.format} format`);
          continue;
        }
      }

      // Check format legality (if format is specified)
      if (context.format === "Modern" || context.format === "Pioneer") {
        const formatLegal = context.format === "Modern" 
          ? (card.legalities?.modern || '').toLowerCase() === 'legal'
          : (card.legalities?.pioneer || '').toLowerCase() === 'legal';
        if (!formatLegal && card.legalities) {
          removalReasons.add('format restriction');
          console.log(`[filter] Removed ${suggestion.card}: not legal in ${context.format}`);
          continue;
        }
      }

      // Check curve constraints
      if (context.curveAnalysis) {
        const cmc = card.cmc || 0;
        // Don't suggest 6-drops if low curve unless wincon
        if (context.curveAnalysis.lowCurve && cmc >= 6) {
          const reasonLower = suggestion.reason.toLowerCase();
          if (!reasonLower.includes('win') && !reasonLower.includes('finisher')) {
            removalReasons.add('curve cap');
            console.log(`[filter] Removed ${suggestion.card}: 6+ CMC in low-curve deck`);
            continue;
          }
        }
        
        // Don't suggest double-pip cards if manabase is tight
        if (context.curveAnalysis.tightManabase && hasDoublePip(card.mana_cost)) {
          removalReasons.add('mana base constraint');
          console.log(`[filter] Removed ${suggestion.card}: double-pip card in tight manabase`);
          continue;
        }
      }

      // Check for incorrect draw/filter classification
      const reasonLower = suggestion.reason.toLowerCase();
      const claimsDraw = /\b(draw|filtering|hand full|card advantage|keeps.*hand|refills.*hand)\b/i.test(reasonLower);
      if (claimsDraw && !isRealDrawOrFilter(card)) {
        removalReasons.add('misclassified draw');
        console.log(`[filter] Removed ${suggestion.card}: not real draw/filter (reason claimed draw but card doesn't)`);
        continue;
      }
      
      // Filter out generic ramp if commander provides ramp OR deck has sufficient ramp
      const isGenRamp = isGenericRamp(suggestion.card);
      if (isGenRamp && (context.commanderProvidesRamp || context.existingRampCount >= 3)) {
        // Check if reason explicitly mentions synergy (landfall, fixing, etc.)
        const hasSynergy = reasonLower.includes('landfall') || 
                          reasonLower.includes('mana value') || 
                          reasonLower.includes('fixing') ||
                          reasonLower.includes('synergy');
        if (!hasSynergy) {
          removalReasons.add('redundant ramp');
          console.log(`[filter] Removed ${suggestion.card}: redundant ramp when commander/deck already ramps`);
          continue;
        }
      }
      
      // Filter out board wipes that harm the deck's plan
      if (isHarmfulBoardWipe(card, context)) {
        removalReasons.add('plan conflict');
        console.log(`[filter] Removed ${suggestion.card}: harmful board wipe for creature-heavy deck`);
        continue;
      }

      // Budget filtering
      let cardPrice: number | undefined;
      if (requiresPriceData) {
        cardPrice = priceMap.get(suggestion.card.toLowerCase().trim());
        if (cardPrice === undefined) {
          removalReasons.add('price unavailable');
          console.log(`[filter] Removed ${suggestion.card}: price unavailable for budget enforcement`);
          continue;
        }
      }

      if (budgetPerCardCap !== undefined && cardPrice !== undefined) {
        const allowsPremium = reasonLower.includes('upgrade') || reasonLower.includes('premium') || reasonLower.includes('powerful');
        if (cardPrice > budgetPerCardCap && !allowsPremium) {
          removalReasons.add('budget cap');
          console.log(`[filter] Removed ${suggestion.card}: ${currency} ${cardPrice.toFixed(2)} exceeds per-card cap ${budgetPerCardCap}`);
          continue;
        }
      }

      if (
        budgetTotalCap !== undefined &&
        cardPrice !== undefined &&
        deckPriceTotal > 0 &&
        deckAveragePrice > 0
      ) {
        const baselineReplace = deckAveragePrice;
        const estimatedNewTotal = deckPriceTotal - baselineReplace + cardPrice;
        if (estimatedNewTotal > budgetTotalCap + 0.01) {
          removalReasons.add('budget total cap');
          console.log(`[filter] Removed ${suggestion.card}: would exceed total budget (${estimatedNewTotal.toFixed(2)} > ${budgetTotalCap.toFixed(2)})`);
          continue;
        }
      }

      // Add unique ID and needs_review flag (card is guaranteed to exist here)
      const suggestionWithMeta = {
        ...suggestion,
        id: crypto.randomUUID(),
        needs_review: false,
      };
      filtered.push(suggestionWithMeta);
    } catch (error) {
      // Skip on error (fail gracefully)
      console.warn(`[filter] Error processing ${suggestion.card}:`, error);
      continue filterLoop;
    }
  }

  // If all suggestions were filtered out, return a helpful message
  if (filtered.length === 0 && suggestions.length > 0) {
    console.log(`[filter] Final suggestions: 0 (removed ${suggestions.length})`);
    
    // Evaluation Mode: Track when suggestions are exhausted
    const deckSize = deckEntries.reduce((sum, e) => sum + e.count, 0);
    const evalData = {
      format: context.format,
      colors: context.colors.join(','),
      deck_size: deckSize,
      archetype: context.archetype || 'none',
      power_level: context.powerLevel || 'unknown',
      raw_suggestions_count: suggestions.length,
      prompt_version: getActivePromptVersion(),
    };
    
    console.log(`[evaluation] ai_suggestion_exhausted`, evalData);
    
    // Server-side PostHog tracking
    try {
      const { captureServer } = await import("@/lib/server/analytics");
      await captureServer('ai_suggestion_exhausted', evalData, userId || null);
    } catch (error) {
      console.warn('[evaluation] Failed to track ai_suggestion_exhausted:', error);
    }
    
    const reasonList = Array.from(removalReasons);
    const fallbackReason = reasonList.length
      ? `No suggestions survived filtering (${reasonList.join(', ')}). Ask for a reroll with a different focus or adjust your request.`
      : "Your deck is already tight for this format. I can help in one of these ways: [1] fine-tune manabase, [2] add interaction, [3] budget passes, [4] polish theme text.";

    return [{
      card: "N/A",
      reason: fallbackReason,
      category: "optional",
      id: crypto.randomUUID(),
      needs_review: false,
    }];
  }

  console.log(`[filter] Final suggestions: ${filtered.length} (removed ${suggestions.length - filtered.length})`);
  return filtered;
}

export async function POST(req: Request) {
  const t0 = Date.now();

  type AnalyzeBody = {
    deckText?: string;
    format?: "Commander" | "Modern" | "Pioneer";
    plan?: "Budget" | "Optimized";
    colors?: string[]; // e.g. ["G","B"]
    currency?: "USD" | "EUR" | "GBP";
    useScryfall?: boolean; // true = do real lookups
    commander?: string; // optional commander name for meta suggestions
    userMessage?: string; // optional user prompt/question
    useGPT?: boolean; // true = call GPT for suggestions
  };

  const body = (await req.json().catch(() => ({}))) as AnalyzeBody;

  const deckText: string = body.deckText ?? "";
  const format: "Commander" | "Modern" | "Pioneer" = body.format ?? "Commander";
  const plan: "Budget" | "Optimized" = body.plan ?? "Optimized";
  const useScryfall: boolean = Boolean(body.useScryfall);
  const selectedColors: string[] = Array.isArray(body.colors) ? body.colors : [];
  const reqCommander: string | null = typeof body.commander === 'string' && body.commander.trim() ? String(body.commander).trim() : null;
  const userMessage: string | undefined = typeof body.userMessage === 'string' ? body.userMessage.trim() || undefined : undefined;
  const useGPT: boolean = Boolean(body.useGPT);
  const currency: "USD" | "EUR" | "GBP" = (body.currency as "USD" | "EUR" | "GBP") ?? "USD";

  // Parse text into entries {count, name}
  const lines = deckText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => Boolean(s));

  const entries = lines.map((l) => {
    const m = l.match(/^(\d+)\s*x?\s*(.+)$/i);
    const count = m ? Number(m[1]) : 1;
    const name = (m ? m[2] : l).replace(/\s*\(.*?\)\s*$/, "").trim();
    return { count: Number.isFinite(count) ? count : 1, name };
  });

  const totalCards = entries.reduce((s, e) => s + e.count, 0);

  // Tally bands
  let lands = 0,
    draw = 0,
    ramp = 0,
    removal = 0;

  // Curve buckets: [<=1, 2, 3, 4, >=5]
  const curveBuckets = [0, 0, 0, 0, 0];

  // Store Scryfall results by name for reuse + legality
  const byName = new Map<string, SfCard>();

  if (useScryfall) {
    const unique = Array.from(new Set(entries.map((e) => e.name))).slice(0, 160);
    // Use batch fetching for better performance (checks DB cache first, then fetches missing cards in batches of 75)
    const batchResults = await fetchCardsBatch(unique);
    // Copy batch results to byName map
    // fetchCardsBatch returns normalized keys, but we store using lowercase for compatibility with existing code
    for (const [key, card] of batchResults.entries()) {
      byName.set(card.name.toLowerCase(), card);
    }

    const landRe = /land/i;
    const drawRe = /draw a card|scry [1-9]/i;
    const rampRe = /add \{[wubrg]\}|search your library for (a|up to .*?) land/i;
    const killRe = /destroy target|exile target|counter target/i;

    for (const { name, count } of entries) {
      const c = byName.get(name.toLowerCase());
      const t = c?.type_line ?? "";
      const o = c?.oracle_text ?? "";
      if (landRe.test(t)) lands += count;
      if (drawRe.test(o)) draw += count;
      if (rampRe.test(o) || /signet|talisman|sol ring/i.test(name)) ramp += count;
      if (killRe.test(o)) removal += count;

      // CMC bucket
      const cmc = typeof c?.cmc === "number" ? c!.cmc : undefined;
      if (typeof cmc === "number") {
        if (cmc <= 1) curveBuckets[0] += count;
        else if (cmc <= 2) curveBuckets[1] += count;
        else if (cmc <= 3) curveBuckets[2] += count;
        else if (cmc <= 4) curveBuckets[3] += count;
        else curveBuckets[4] += count;
      }
    }
  } else {
    const landRx = /\b(Island|Swamp|Plains|Forest|Mountain|Gate|Temple|Land)\b/i;
    const drawRx =
      /\b(Draw|Opt|Ponder|Brainstorm|Read the Bones|Sign in Blood|Beast Whisperer|Inspiring Call)\b/i;
    const rampRx =
      /\b(Rampant Growth|Cultivate|Kodama's|Solemn|Signet|Talisman|Sol Ring|Arcane Signet|Fellwar Stone)\b/i;
    const removalRx =
      /\b(Removal|Swords to Plowshares|Path to Exile|Terminate|Go for the Throat|Beast Within)\b/i;

    lands = entries.filter((e) => landRx.test(e.name)).reduce((s, e) => s + e.count, 0);
    draw = entries.filter((e) => drawRx.test(e.name)).reduce((s, e) => s + e.count, 0);
    ramp = entries.filter((e) => rampRx.test(e.name)).reduce((s, e) => s + e.count, 0);
    removal = entries.filter((e) => removalRx.test(e.name)).reduce((s, e) => s + e.count, 0);
    // No CMC data without Scryfall; buckets remain 0s.
  }

  // Simple curve band from deck size; ramp/draw/removal normalized
  const landTarget = format === "Commander" ? 35 : 24;
  const manaBand = lands >= landTarget ? 0.8 : lands >= landTarget - 2 ? 0.7 : 0.55;

  const bands = {
    curve: Math.min(1, Math.max(0.5, 0.8 - Math.max(0, totalCards - (format === "Commander" ? 100 : 60)) * 0.001)),
    ramp: Math.min(1, ramp / 6 + 0.4),
    draw: Math.min(1, draw / 6 + 0.4),
    removal: Math.min(1, removal / 6 + 0.2),
    mana: Math.min(1, manaBand),
  };

  const score = Math.round((bands.curve + bands.ramp + bands.draw + bands.removal + bands.mana) * 20);

  const whatsGood: string[] = [];
  const quickFixes: string[] = [];

  if (lands >= landTarget) whatsGood.push(`Mana base looks stable for ${format}.`);
  else quickFixes.push(`Add ${format === "Commander" ? "2–3" : "1–2"} lands (aim ${landTarget}${format === "Commander" ? " for EDH" : ""}).`);

  if (ramp >= 8) whatsGood.push("Healthy ramp density.");
  else quickFixes.push("Add 2 cheap rocks: <em>Arcane Signet</em>, <em>Fellwar Stone</em>.");

  if (draw >= 8) whatsGood.push("Card draw density looks fine.");
  else quickFixes.push("Add 2 draw spells: <em>Beast Whisperer</em>, <em>Inspiring Call</em>.");

  if (removal < 5) quickFixes.push(`Add 1–2 interaction pieces: <em>Swords to Plowshares</em>, <em>Path to Exile</em>.`);

  // --- NEW: Commander color-identity legality check (requires Scryfall + colors) ---
  let illegalByCI = 0;
  let illegalExamples: string[] = [];

  // --- NEW: Banned cards for selected format ---
  let bannedCount = 0;
  let bannedExamples: string[] = [];

  if (format === "Commander" && useScryfall) {
    // Banned list via Scryfall legalities
    const banned: string[] = [];
    for (const { name } of entries) {
      const c = byName.get(name.toLowerCase());
      if (!c) continue;
      if ((c.legalities?.commander || '').toLowerCase() === 'banned') banned.push(c.name);
    }
    const uniqBanned = Array.from(new Set(banned));
    bannedCount = uniqBanned.length;
    bannedExamples = uniqBanned.slice(0, 5);
  }

  if (format === "Commander" && useScryfall && selectedColors.length > 0) {
    const allowed = new Set(selectedColors.map((c) => c.toUpperCase())); // e.g. G,B
    const offenders: string[] = [];

    for (const { name } of entries) {
      const c = byName.get(name.toLowerCase());
      if (!c) continue;

      const ci = (c.color_identity ?? []).map((x) => x.toUpperCase());
      const illegal = ci.length > 0 && ci.some((symbol) => !allowed.has(symbol));
      if (illegal) offenders.push(c.name);
    }

    const uniqueOffenders = Array.from(new Set(offenders));
    illegalByCI = uniqueOffenders.length;
    illegalExamples = uniqueOffenders.slice(0, 5);
  }

  // --- NEW: curve-aware quick fixes (format-aware targets) ---
  if (useScryfall) {
    const [b01, b2, b3, b4, b5p] = curveBuckets;
    if (format === "Commander") {
      // loose, friendly targets for 100-card singleton decks
      if (b2 < 12) quickFixes.push("Fill the 2-drop gap (aim ~12): cheap dorks, signets/talismans, utility bears.");
      if (b01 < 8) quickFixes.push("Add 1–2 more one-drops: ramp dorks or cheap interaction.");
      if (b5p > 16) quickFixes.push("Top-end is heavy; trim a few 5+ CMC spells for smoother starts.");
    } else {
      // 60-card formats: suggest smoothing low curve
      if (b01 < 10) quickFixes.push("Increase low curve (≤1 CMC) to improve early plays.");
      if (b2 < 8) quickFixes.push("Add a couple more 2-drops for consistent curve.");
    }
  }

  const note =
    draw < 6 ? "needs a touch more draw" : lands < landTarget - 2 ? "mana base is light" : "solid, room to tune";

  // Meta inclusion hints: annotate cards that are popular across commanders
  let metaHints: Array<{ card: string; inclusion_rate: string; commanders: string[] }> = [];

  // --- NEW: Token needs summary (naive oracle scan for common tokens) ---
  const tokenNames = ['Treasure','Clue','Food','Soldier','Zombie','Goblin','Saproling','Spirit','Thopter','Angel','Dragon','Vampire','Eldrazi','Golem','Cat','Beast','Faerie','Plant','Insect'];
  const tokenNeedsSet = new Set<string>();
  try {
    for (const { name } of entries) {
      const c = byName.get(name.toLowerCase());
      const o = (c?.oracle_text || '').toString();
      if (/create/i.test(o) && /token/i.test(o)) {
        for (const t of tokenNames) { if (new RegExp(`\n|\b${t}\b`, 'i').test(o)) tokenNeedsSet.add(t); }
      }
    }
  } catch {}
  const tokenNeeds = Array.from(tokenNeedsSet).sort();
  try {
    const metaPath = path.resolve(process.cwd(), "AI research (2)", "AI research", "commander_metagame.json");
    const buf = await fs.readFile(metaPath, "utf8");
    const meta = JSON.parse(buf);
    if (Array.isArray(meta)) {
      const inclMap = new Map<string, { rate: string; commanders: Set<string> }>();
      for (const entry of meta) {
        const commander = String(entry?.commander_name || "");
        for (const tc of (entry?.top_cards || []) as any[]) {
          const name = String(tc?.card_name || "");
          const rate = String(tc?.inclusion_rate || "");
          if (!name) continue;
          const key = name.toLowerCase();
          const cur = inclMap.get(key) || { rate, commanders: new Set<string>() };
          const curNum = parseFloat((cur.rate || "0").replace(/[^0-9.]/g, "")) || 0;
          const newNum = parseFloat((rate || "0").replace(/[^0-9.]/g, "")) || 0;
          if (newNum > curNum) cur.rate = rate;
          cur.commanders.add(commander);
          inclMap.set(key, cur);
        }
      }
      // 1) For cards in this deck (contextual notes)
      for (const { name } of entries) {
        const m = inclMap.get(name.toLowerCase());
        if (m) metaHints.push({ card: name, inclusion_rate: m.rate, commanders: Array.from(m.commanders).slice(0, 3) });
      }
      // 2) If commander provided, offer top includes not already in deck
      if (reqCommander) {
        const deckSet = new Set(entries.map(e => e.name.toLowerCase()));
        const byCommander = (meta as any[]).find((e:any) => String(e?.commander_name || '').toLowerCase() === reqCommander.toLowerCase());
        if (byCommander && Array.isArray(byCommander.top_cards)) {
          const picks = [] as Array<{ card: string; inclusion_rate: string; commanders: string[] }>;
          for (const tc of byCommander.top_cards as any[]) {
            const name = String(tc?.card_name || '').trim();
            if (!name) continue;
            if (!deckSet.has(name.toLowerCase())) picks.push({ card: name, inclusion_rate: String(tc?.inclusion_rate || ''), commanders: [byCommander.commander_name] });
            if (picks.length >= 12) break;
          }
          // If metaHints is empty, use these as suggestions; else append
          metaHints = metaHints.concat(picks);
        }
      }
    }
  } catch {}

  // Combo detection (present + one piece missing) using the Scryfall data we already fetched
  let combosPresent: Array<{ name: string; pieces: string[] }> = [];
  let combosMissing: Array<{ name: string; have: string[]; missing: string[]; suggest: string }> = [];
  try {
    const { normalizeDeckNames, detectCombosSmart } = await import("@/lib/combos/detect");
    const names = normalizeDeckNames(deckText);
    const details: Record<string, { type_line?: string; oracle_text?: string | null; name?: string }> = {};
    for (const [k, v] of byName.entries()) details[k] = { name: v.name, type_line: v.type_line, oracle_text: v.oracle_text };
    const res = detectCombosSmart(names, details);
    combosPresent = (res.present || []).map(p => ({ name: p.name, pieces: p.pieces }));
    combosMissing = (res.missing || []).map(m => ({ name: m.name, have: m.have, missing: m.missing, suggest: m.suggest }));
  } catch {}

  // Get user ID for analytics (optional - doesn't block if auth fails)
  let userId: string | null = null;
  try {
    const { getServerSupabase } = await import("@/lib/server-supabase");
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || null;
  } catch {
    // User ID is optional for analytics
  }

  // GPT-based suggestions with inference and filtering (enabled by default when useScryfall is true)
  let gptSuggestions: Array<{ card: string; reason: string; category?: string; id?: string; needs_review?: boolean }> = [];
  let suggestionPartial = false;
  let suggestionDebug: { filtered: FilteredCandidate[]; planned: number; filled: number; required: number } = {
    filtered: [],
    planned: 0,
    filled: 0,
    required: 0,
  };
  if (useScryfall) {
    try {
      // Infer deck context
      const inferredContext = await inferDeckContext(
        deckText,
        userMessage,
        entries,
        format,
        reqCommander,
        selectedColors,
        byName,
        { plan, currency }
      );

      // Log inferred values with enhanced logging
      const totalCards = entries.reduce((sum, e) => sum + e.count, 0);
      console.log('[inference] Detected format:', inferredContext.format, `(cards: ${totalCards}, commander: ${inferredContext.commander || 'none'})`);
      console.log('[inference] Detected colors:', inferredContext.colors.join(', ') || 'none');
      console.log('[analyze] Inferred context:', {
        commander: inferredContext.commander,
        colors: inferredContext.colors,
        format: inferredContext.format,
        powerLevel: inferredContext.powerLevel,
        commanderProvidesRamp: inferredContext.commanderProvidesRamp,
        landCount: inferredContext.landCount,
        archetype: inferredContext.archetype,
        protectedRoles: inferredContext.protectedRoles?.length || 0,
        isBudget: inferredContext.isBudget,
        userIntent: inferredContext.userIntent,
        curveAnalysis: inferredContext.curveAnalysis,
        roleDistribution: inferredContext.roleDistribution ? {
          byRole: inferredContext.roleDistribution.byRole,
          redundancyCount: Object.keys(inferredContext.roleDistribution.redundancy).length,
        } : null,
        manabaseAcceptable: inferredContext.manabaseAnalysis?.isAcceptable,
      });

      // Call GPT for suggestions
      const plannedSlots = await planSuggestionSlots(deckText, userMessage, inferredContext);
      const filledSlots =
        plannedSlots.length > 0
          ? await fillSuggestionSlots(plannedSlots, inferredContext, deckText, userMessage)
          : [];

      const validation = await validateFilledSlots(
        filledSlots,
        inferredContext,
        entries,
        byName,
        deckText,
        userMessage
      );

      suggestionDebug = {
        filtered: validation.filtered,
        planned: plannedSlots.length,
        filled: validation.filledCount,
        required: validation.requiredCount,
      };
      suggestionPartial = validation.filledCount < validation.requiredCount;

      const rawSuggestions = validation.suggestions.map((suggestion) => {
        const normalizedRole = suggestion.slotRole?.toLowerCase() ?? "";
        let category: "must-fix" | "synergy-upgrade" | "optional" = "optional";
        if (normalizedRole.includes("must") || normalizedRole.includes("fix")) category = "must-fix";
        else if (normalizedRole.includes("upgrade") || normalizedRole.includes("synergy")) category = "synergy-upgrade";

        return {
          card: suggestion.name,
          reason:
            suggestion.reason ||
            `Supports ${suggestion.slotRole || "the deck plan"}.`,
          category,
          source: suggestion.source,
        };
      });

      let usePlaceholder = false;
      if (rawSuggestions.length === 0) {
        usePlaceholder = true;
        suggestionPartial = true;
        rawSuggestions.push({
          card: "N/A",
          reason:
            plannedSlots.length === 0
              ? "AI planner returned no actionable slots. Please try again."
              : "All GPT suggestions failed validation. Please try again.",
          category: "optional",
        });
      }

      console.log(
        '[analyze] Planned slots:',
        plannedSlots.length,
        'Filled slots:',
        filledSlots.length,
        'Validated:',
        validation.suggestions.length,
      );
      console.log('[analyze] Validation filtered:', validation.filtered);

      if (usePlaceholder) {
        gptSuggestions = rawSuggestions;
      } else {
        // Post-filter suggestions (budget, legality double-check)
        gptSuggestions = await postFilterSuggestions(rawSuggestions, inferredContext, byName, currency, entries, userId);
        if (gptSuggestions.length < validation.requiredCount) {
          suggestionPartial = true;
        }
      }
      console.log('[analyze] Filtered suggestions:', gptSuggestions.length, gptSuggestions.map(s => s.card));
    } catch (error) {
      console.error('[analyze] Error in GPT suggestions:', error);
      // Silently fail - GPT suggestions are nice-to-have, not critical
    }
  }

  return Response.json({
    score,
    note,
    bands,
    curveBuckets, // <= NEW
    counts: { lands, ramp, draw, removal }, // <= NEW: raw category counts for presets
    whatsGood: whatsGood.length ? whatsGood : ["Core plan looks coherent."],
    quickFixes: plan === "Budget" ? quickFixes.map((s) => s.replace("Beast Whisperer", "Guardian Project")) : quickFixes,
    illegalByCI,
    illegalExamples,
    bannedCount,
    bannedExamples,
    tokenNeeds,
    metaHints,
    combosPresent,
    combosMissing,
    suggestions: gptSuggestions, // GPT-filtered suggestions
    partial: suggestionPartial,
    debug: {
      filteredCandidates: suggestionDebug.filtered,
      plannedSlots: suggestionDebug.planned,
      requiredSuggestions: suggestionDebug.required,
      filledSuggestions: suggestionDebug.filled,
    },
    prompt_version: useGPT && useScryfall ? getActivePromptVersion() : undefined, // Include for A/B testing analytics
  });
}
