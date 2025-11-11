// app/api/deck/analyze/route.ts

import {
  type SfCard,
  type InferredDeckContext,
  fetchCard,
  fetchCardsBatch,
  inferDeckContext,
} from "@/lib/deck/inference";
import { getActivePromptVersion } from "@/lib/config/prompts";
import { COMMANDER_PROFILES } from "@/lib/deck/archetypes";
import {
  CardSuggestion,
  isWithinColorIdentity,
  matchesRequestedType,
  isLegalForFormat,
  normalizeCardName,
} from "@/lib/deck/mtgValidators";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import roleBaselines from "@/lib/data/role_baselines.json";
import colorIdentityMap from "@/lib/data/color_identity_map.json";
import commanderProfiles from "@/lib/data/commander_profiles.json";

type RoleBaselineEntry = {
  min?: number;
  recommended?: number;
  max?: number;
  notes?: string;
};

type RoleBaselines = {
  commander?: Record<string, RoleBaselineEntry>;
  modern?: Record<string, RoleBaselineEntry>;
  forbid_mislabels?: string[];
};

type ColorIdentityInfo = {
  colors?: string[];
  strengths?: string[];
  weaknesses?: string[];
};

type ColorIdentityDictionary = Record<string, ColorIdentityInfo>;

type CommanderProfileJson = {
  plan?: string;
  preferTags?: string[];
  avoid?: string[];
  mustBePermanent?: boolean;
  notes?: string;
};

type CommanderProfilesDictionary = Record<string, CommanderProfileJson>;

type CommanderProfileEnriched = {
  mustBePermanent?: boolean;
  preferTags?: string[];
  plan?: string;
  avoid?: string[];
  notes?: string;
  archetypeHint?: string;
};

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const roleBaselineData = roleBaselines as RoleBaselines;
const colorIdentityData = colorIdentityMap as ColorIdentityDictionary;
const commanderProfilesData = commanderProfiles as CommanderProfilesDictionary;

const COLOR_PAIR_LABELS: Record<string, string> = {
  WU: "Azorius",
  UW: "Azorius",
  UB: "Dimir",
  BU: "Dimir",
  BR: "Rakdos",
  RB: "Rakdos",
  RG: "Gruul",
  GR: "Gruul",
  GW: "Selesnya",
  WG: "Selesnya",
  WB: "Orzhov",
  BW: "Orzhov",
  UR: "Izzet",
  RU: "Izzet",
  BG: "Golgari",
  GB: "Golgari",
  RW: "Boros",
  WR: "Boros",
  GU: "Simic",
  UG: "Simic",
};

const FAST_MANA = new Set([
  "Mana Crypt",
  "Jeweled Lotus",
  "Mana Vault",
  "Mox Diamond",
  "Chrome Mox",
]);

const COMMANDER_BANNED: Record<string, true> = {
  "Ancestral Recall": true,
  "Balance": true,
  "Biorhythm": true,
  "Black Lotus": true,
  "Channel": true,
  "Emrakul, the Aeons Torn": true,
  "Falling Star": true,
  "Fastbond": true,
  "Flash": true,
  "Gifts Ungiven": true,
  "Golos, Tireless Pilgrim": true,
  "Griselbrand": true,
  "Hullbreacher": true,
  "Iona, Shield of Emeria": true,
  "Kokusho, the Evening Star": true,
  "Leovold, Emissary of Trest": true,
  "Library of Alexandria": true,
  "Limited Resources": true,
  "Mox Emerald": true,
  "Mox Jet": true,
  "Mox Pearl": true,
  "Mox Ruby": true,
  "Mox Sapphire": true,
  "Painter's Servant": true,
  "Panoptic Mirror": true,
  "Paradox Engine": true,
  "Primeval Titan": true,
  "Prophet of Kruphix": true,
  "Recurring Nightmare": true,
  "Sundering Titan": true,
  "Sway of the Stars": true,
  "Sylvan Primordial": true,
  "Time Vault": true,
  "Time Walk": true,
  "Tinker": true,
  "Tolarian Academy": true,
  "Trade Secrets": true,
  "Upheaval": true,
  "Yawgmoth's Bargain": true,
};

const COMMANDER_ONLY_CARDS = new Set([
  "Sol Ring",
  "Command Tower",
  "Arcane Signet",
  "Commander Sphere",
  "Commander Plate",
  "The Great Henge",
  "Rhystic Study",
  "Smothering Tithe",
  "Mystic Remora",
  "Dockside Extortionist",
  "Fierce Guardianship",
  "Deadly Rollick",
  "Flawless Maneuver",
  "Deflecting Swat",
  "Teferi's Protection",
  "Guardian Project",
  "Beast Whisperer",
  "Kindred Discovery",
  "Path of Ancestry",
  "Exotic Orchard",
  "Reflecting Pool",
]);

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

type ValidatedSuggestion = CardSuggestion & {
  slotRole: string;
};

type FilteredCandidate = {
  slotRole: string;
  name: string;
  reason: string;
  source: "gpt" | "retry";
};

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const { temperature = 0.35, maxTokens = 400 } = opts;

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
    throw new Error(message);
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
  const profile = getCommanderProfileData(context.commander);
  const promptVersion = getActivePromptVersion();

  const systemPrompt = [
    "You are ManaTap's planning assistant. Decide what slots need card suggestions before naming any cards.",
    "Return STRICT JSON: {\"slots\":[{\"role\":\"...\",\"requestedType\":\"permanent|instant|any\",\"colors\":[\"G\",\"R\"],\"notes\":\"short\",\"quantity\":1}]}"
  ].join("\n");

  const profileNoteLines = buildCommanderProfileNotes(profile);
  const baselineSummary = buildCommanderBaselineSummary(context.format);
  const colorSummary = buildColorIdentitySummary(context.colors);

  const userPrompt = [
    `Format: ${context.format}`,
    `Deck colors: ${context.colors.join(", ") || "Colorless"}`,
    context.commander ? `Commander: ${context.commander}` : "Commander: (none)",
    profileNoteLines.length ? profileNoteLines.join("\n") : "",
    baselineSummary || "",
    colorSummary || "",
    context.userIntent ? `User goal: ${context.userIntent}` : "",
    context.archetype ? `Detected archetype: ${context.archetype}` : "",
    context.powerLevel ? `Power level: ${context.powerLevel}` : "",
    userMessage ? `User message:\n${userMessage}` : "",
    "Decklist:",
    deckText,
    "",
    "Plan 3-6 slots that cover ramp, interaction, recursion, win conditions, or meta tech as needed.",
    "Be concise and respect commander colors/type requirements.",
    `Prompt version: ${promptVersion}-planner`,
  ].filter(Boolean).join("\n");

  try {
    const raw = await callOpenAI(systemPrompt, userPrompt, { temperature: 0.2, maxTokens: 380 });
    const parsed = extractJsonObject(raw);
    const slots = Array.isArray(parsed?.slots) ? parsed.slots : [];
    return slots.slice(0, 8).map((slot: any) => ({
      role: String(slot?.role || "optional").trim() || "optional",
      requestedType: slot?.requestedType ? String(slot.requestedType) : undefined,
      colors: Array.isArray(slot?.colors)
        ? slot.colors.map((c: string) => String(c).toUpperCase())
        : undefined,
      notes: slot?.notes ? String(slot.notes) : undefined,
      quantity: Number.isFinite(slot?.quantity) ? Number(slot.quantity) : undefined,
    }));
  } catch {
    return [];
  }
}

async function fetchSlotCandidates(
  slot: SuggestionSlotPlan,
  context: InferredDeckContext,
  deckText: string,
  userMessage: string | undefined,
  mode: "normal" | "strict" = "normal"
): Promise<SlotCandidate[]> {
  const profile = getCommanderProfileData(context.commander);

  const systemPrompt = [
    mode === "strict"
      ? "You must provide legal, on-color Magic card options for one specific slot."
      : "You suggest Magic cards for one specific slot.",
    "Always respond with STRICT JSON: {\"candidates\":[{\"name\":\"...\",\"reason\":\"...\"}]}"
  ].join("\n");

  const slotColors = slot.colors?.length ? slot.colors.join(", ") : context.colors.join(", ");
  const profileNoteLines = buildCommanderProfileNotes(profile);
  const baselineSummary = buildCommanderBaselineSummary(context.format);
  const colorSummary = buildColorIdentitySummary(context.colors);

  const userPrompt = [
    `Format: ${context.format}`,
    `Deck colors: ${context.colors.join(", ") || "Colorless"}`,
    slotColors ? `Allowed colors for this slot: ${slotColors}` : "",
    slot.requestedType ? `Requested type: ${slot.requestedType}` : "Requested type: flexible",
    context.commander ? `Commander: ${context.commander}` : "",
    profileNoteLines.length ? profileNoteLines.join(" | ") : "",
    baselineSummary || "",
    colorSummary || "",
    slot.notes ? `Slot note: ${slot.notes}` : "",
    userMessage ? `User prompt: ${userMessage}` : "",
    "Deck excerpt:",
    deckText.slice(0, 1800),
    "",
    mode === "strict"
      ? "Return 5 legal, on-color replacements that obey the requested type."
      : "Return the 3 best candidates with short reasons.",
  ].filter(Boolean).join("\n");

  try {
    const raw = await callOpenAI(systemPrompt, userPrompt, { temperature: mode === "strict" ? 0.15 : 0.35, maxTokens: 320 });
    const parsed = extractJsonObject(raw);
    const items = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    return items.slice(0, mode === "strict" ? 6 : 5).map((item: any) => ({
      name: String(item?.name || "").trim(),
      reason: item?.reason ? String(item.reason) : undefined,
    }));
  } catch {
    return [];
  }
}

async function retrySlotCandidates(
  slot: SuggestionSlotPlan,
  context: InferredDeckContext,
  deckText: string,
  userMessage: string | undefined,
  mode: "normal" | "strict" = "normal"
): Promise<SlotCandidate[]> {
  const systemPrompt = [
    mode === "strict"
      ? "Previous suggestions failed validation. Provide 5 legal, on-color replacements that obey the requested type."
      : "Previous suggestions failed validation (off-color, wrong type, illegal). Provide stricter replacements.",
    "Return STRICT JSON: {\"candidates\":[{\"name\":\"...\",\"reason\":\"...\"}]}"
  ].join("\n");

  const slotColors = slot.colors?.length ? slot.colors.join(", ") : context.colors.join(", ");
  const profile = getCommanderProfileData(context.commander);
  const profileNoteLines = buildCommanderProfileNotes(profile);
  const baselineSummary = buildCommanderBaselineSummary(context.format);
  const colorSummary = buildColorIdentitySummary(context.colors);

  const userPrompt = [
    `Format: ${context.format}`,
    slotColors ? `Colors EXACT: ${slotColors}` : "",
    slot.requestedType ? `Required type: ${slot.requestedType}` : "",
    context.commander ? `Commander: ${context.commander}` : "",
    profileNoteLines.length ? profileNoteLines.join(" | ") : "",
    baselineSummary || "",
    colorSummary || "",
    "Deck excerpt:",
    deckText.slice(0, 1500),
    userMessage ? `User prompt: ${userMessage}` : "",
    "",
    mode === "strict"
      ? "Return 5 legal, on-color replacements that obey the requested type."
      : "Return 3 replacements that obey color identity AND requested type strictly.",
  ].filter(Boolean).join("\n");

  try {
    const raw = await callOpenAI(systemPrompt, userPrompt, { temperature: mode === "strict" ? 0.1 : 0.2, maxTokens: 260 });
    const parsed = extractJsonObject(raw);
    const items = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    return items.slice(0, mode === "strict" ? 6 : 5).map((item: any) => ({
      name: String(item?.name || "").trim(),
      reason: item?.reason ? String(item.reason) : undefined,
    }));
  } catch {
    return [];
  }
}

async function validateSlots(
  slots: SuggestionSlotPlan[],
  context: InferredDeckContext,
  deckEntries: Array<{ count: number; name: string }>,
  byName: Map<string, SfCard>,
  deckText: string,
  userMessage: string | undefined,
  strict = false
): Promise<{
  suggestions: CardSuggestion[];
  filtered: FilteredCandidate[];
  required: number;
  filled: number;
}> {
  const suggestions: CardSuggestion[] = [];
  const filtered: FilteredCandidate[] = [];
  const deckNormalized = new Set(deckEntries.map((entry) => normalizeCardName(entry.name)));
  const profile = getCommanderProfileData(context.commander);
  const isCommander = context.format === "Commander";

  for (const slot of slots) {
    const quantity = Math.max(1, slot.quantity ?? 1);
    const baseCandidates = await fetchSlotCandidates(slot, context, deckText, userMessage, strict ? "strict" : "normal");
    let picked = 0;

    const attempt = async (candidates: SlotCandidate[], source: "gpt" | "retry") => {
      for (const candidate of candidates) {
        if (picked >= quantity) break;
        const normalizedName = normalizeCardName(candidate.name);
        if (!candidate.name || !normalizedName) {
          filtered.push({ slotRole: slot.role, name: candidate.name || "", reason: "missing name", source });
          continue;
        }
        if (deckNormalized.has(normalizedName)) {
          filtered.push({ slotRole: slot.role, name: candidate.name, reason: "already in deck", source });
          continue;
        }

        let card = byName.get(candidate.name.toLowerCase());
        if (!card) {
          const fetched = await fetchCard(candidate.name);
          if (fetched) {
            card = fetched;
            byName.set(fetched.name.toLowerCase(), fetched);
          }
        }
        if (!card) {
          filtered.push({ slotRole: slot.role, name: candidate.name, reason: "card lookup failed", source });
          continue;
        }

        if (!isCommander && COMMANDER_ONLY_CARDS.has(card.name)) {
          filtered.push({ slotRole: slot.role, name: card.name, reason: "commander-only outside EDH", source });
          continue;
        }

        const allowedColors = (slot.colors?.length ? slot.colors : context.colors).map((c) => c.toUpperCase());
        const colorCheck = allowedColors.length ? allowedColors : ["C"];
        if (!isWithinColorIdentity(card, colorCheck)) {
          filtered.push({ slotRole: slot.role, name: card.name, reason: "off-color", source });
          continue;
        }
        if (!isLegalForFormat(card, context.format)) {
          filtered.push({ slotRole: slot.role, name: card.name, reason: `illegal in ${context.format}`, source });
          continue;
        }
        if (profile?.mustBePermanent && !matchesRequestedType(card, "permanent")) {
          filtered.push({ slotRole: slot.role, name: card.name, reason: "commander requires permanents", source });
          continue;
        }
        if (slot.requestedType && slot.requestedType.toLowerCase() !== "any") {
          if (!matchesRequestedType(card, slot.requestedType)) {
            filtered.push({ slotRole: slot.role, name: card.name, reason: `expected ${slot.requestedType}`, source });
            continue;
          }
        }

        suggestions.push({
          card: card.name,
          reason: candidate.reason,
          source,
          requestedType: slot.requestedType,
        });
        deckNormalized.add(normalizedName);
        picked += 1;
      }
    };

    await attempt(baseCandidates, "gpt");
    if (picked < quantity) {
      const retry = await retrySlotCandidates(slot, context, deckText, userMessage, strict ? "strict" : "normal");
      await attempt(retry, "retry");
    }
  }

  const required = slots.reduce((sum, slot) => sum + Math.max(1, slot.quantity ?? 1), 0);
  return { suggestions, filtered, required, filled: suggestions.length };
}

async function postFilterSuggestions(
  candidates: CardSuggestion[],
  context: InferredDeckContext,
  byName: Map<string, SfCard>,
  normalizedDeck: Set<string>,
  _currency: string,
  _deckEntries: Array<{ count: number; name: string }>,
  _userId: string | null,
  profile: CommanderProfileEnriched | null
): Promise<{ final: CardSuggestion[]; debug: Set<string> }> {
  const removalReasons = new Set<string>();
  const allowedColors = new Set((context.colors.length ? context.colors : ["C"]).map((c) => c.toUpperCase()));
  const merged = new Map<string, CardSuggestion>();
  const forbidRules = Array.isArray(roleBaselineData?.forbid_mislabels)
    ? roleBaselineData.forbid_mislabels
    : [];
  const creatureRampRule = forbidRules.find((rule) => /cultivate/i.test(rule));
  const fabledPassageRule = forbidRules.find((rule) => /fabled passage/i.test(rule));
  const fastManaRule = forbidRules.find((rule) => /mana crypt/i.test(rule) || /fast mana/i.test(rule));

  for (const suggestion of candidates) {
    let card = byName.get(suggestion.card.toLowerCase());
    if (!card) {
      const fetched = await fetchCard(suggestion.card);
      if (fetched) {
        card = fetched;
        byName.set(fetched.name.toLowerCase(), fetched);
      }
    }
    if (!card) {
      removalReasons.add("card lookup failed");
      continue;
    }

    if (context.format === "Commander" && COMMANDER_BANNED[card.name]) {
      const message = suggestion.reason
        ? `${suggestion.reason} (banned in Commander, suggest a legal alternative)`
        : "Banned in Commander, suggest a legal alternative.";
      const existing = merged.get(card.name);
      if (existing) {
        existing.reason = [existing.reason, message].filter(Boolean).join(" | ") || message;
        existing.needs_review = true;
      } else {
        merged.set(card.name, {
          card: card.name,
          reason: message,
          source: suggestion.source,
          requestedType: suggestion.requestedType,
          needs_review: true,
        });
      }
      removalReasons.add("banned");
      continue;
    }

    if (COMMANDER_ONLY_CARDS.has(card.name) && context.format !== "Commander") {
      removalReasons.add("commander-only outside format");
      continue;
    }

    if (!isWithinColorIdentity(card, Array.from(allowedColors))) {
      removalReasons.add("off-color identity");
      continue;
    }

    if (!isLegalForFormat(card, context.format)) {
      removalReasons.add("illegal in format");
      continue;
    }

    if (profile?.mustBePermanent && !matchesRequestedType(card, "permanent")) {
      removalReasons.add("commander requires permanents");
      continue;
    }

    const norm = normalizeCardName(card.name);
    if (normalizedDeck.has(norm)) {
      removalReasons.add("duplicate");
      continue;
    }

    let needsReview = Boolean(suggestion.needs_review);
    let reasonText = suggestion.reason || "";
    const reviewNotes: string[] = [];
    const lowerReason = reasonText.toLowerCase();

    if (/cultivate|kodama's reach/i.test(card.name) && lowerReason.includes("creature ramp")) {
      reviewNotes.push(creatureRampRule || "Cultivate-style sorceries are spell-based ramp, not creature ramp.");
    }

    if (/fabled passage/i.test(card.name) && /ramp/.test(lowerReason)) {
      reviewNotes.push(fabledPassageRule || "Fabled Passage fixes colors but does not generate extra mana.");
    }

    if (FAST_MANA.has(card.name) && shouldFlagFastMana(context.powerLevel)) {
      reviewNotes.push(fastManaRule || "Fast mana is typically reserved for high-power or cEDH tables.");
    }

    if (reviewNotes.length) {
      needsReview = true;
      const noteText = reviewNotes.join(" ");
      reasonText = reasonText ? `${reasonText} (${noteText})` : noteText;
    }

    if (merged.has(card.name)) {
      const existing = merged.get(card.name)!;
      const combinedReason = [existing.reason, reasonText]
        .filter(Boolean)
        .map((r) => r!.trim())
        .filter(Boolean)
        .join(" | ");
      existing.reason = combinedReason || existing.reason;
      existing.needs_review = existing.needs_review || needsReview;
      if (reviewNotes.length) {
        const mergedNotes = new Set<string>(existing.reviewNotes || []);
        reviewNotes.forEach((note) => mergedNotes.add(note));
        existing.reviewNotes = Array.from(mergedNotes);
      }
      merged.set(card.name, existing);
      removalReasons.add("duplicate suggestion");
      continue;
    }

    merged.set(card.name, {
      card: card.name,
      reason: reasonText || undefined,
      source: suggestion.source,
      requestedType: suggestion.requestedType,
      needs_review: needsReview || undefined,
      reviewNotes: reviewNotes.length ? reviewNotes : undefined,
    });
  }

  const final = Array.from(merged.values());
  return { final, debug: removalReasons };
}

function computeBands(
  format: "Commander" | "Modern" | "Pioneer",
  totalCards: number,
  lands: number,
  ramp: number,
  draw: number,
  removal: number
) {
  const landTarget = format === "Commander" ? 35 : 24;
  const manaBand = lands >= landTarget ? 0.8 : lands >= landTarget - 2 ? 0.7 : 0.55;
  return {
    curve: Math.min(1, Math.max(0.5, 0.8 - Math.max(0, totalCards - (format === "Commander" ? 100 : 60)) * 0.001)),
    ramp: Math.min(1, ramp / 6 + 0.4),
    draw: Math.min(1, draw / 6 + 0.4),
    removal: Math.min(1, removal / 6 + 0.25),
    mana: Math.min(1, manaBand),
  };
}

function deckTally(
  entries: Array<{ count: number; name: string }>,
  byName: Map<string, SfCard>
): { lands: number; ramp: number; draw: number; removal: number; curve: number[] } {
  let lands = 0;
  let ramp = 0;
  let draw = 0;
  let removal = 0;
  const curve = [0, 0, 0, 0, 0];

  const landRe = /land/i;
  const drawRe = /draw a card|scry [1-9]|investigate/i;
  const rampRe = /add \{[wubrg]\}|search your library for (a|up to .*?) land/i;
  const killRe = /destroy target|exile target|counter target|fight target|deal .* damage to any target/i;

  for (const { name, count } of entries) {
    const card = byName.get(name.toLowerCase());
    const typeLine = card?.type_line || "";
    const oracle = card?.oracle_text || "";

    if (landRe.test(typeLine)) lands += count;
    if (drawRe.test(oracle)) draw += count;
    if (rampRe.test(oracle) || /signet|talisman|sol ring/i.test(name)) ramp += count;
    if (killRe.test(oracle)) removal += count;

    const cmc = typeof card?.cmc === "number" ? card!.cmc : undefined;
    if (typeof cmc === "number") {
      if (cmc <= 1) curve[0] += count;
      else if (cmc <= 2) curve[1] += count;
      else if (cmc <= 3) curve[2] += count;
      else if (cmc <= 4) curve[3] += count;
      else curve[4] += count;
    }
  }

  return { lands, ramp, draw, removal, curve };
}

function getCommanderProfileData(name: string | null | undefined): CommanderProfileEnriched | null {
  if (!name) return null;
  const jsonProfile = commanderProfilesData[name] ?? null;
  const legacyProfile = COMMANDER_PROFILES[name] ?? null;
  if (!jsonProfile && !legacyProfile) return null;
  const preferTags = new Set<string>();
  legacyProfile?.preferTags?.forEach((tag) => preferTags.add(tag));
  jsonProfile?.preferTags?.forEach((tag) => preferTags.add(tag));

  return {
    mustBePermanent: jsonProfile?.mustBePermanent ?? legacyProfile?.mustBePermanent ?? undefined,
    preferTags: preferTags.size ? Array.from(preferTags) : undefined,
    plan: jsonProfile?.plan ?? legacyProfile?.archetypeHint ?? undefined,
    avoid: jsonProfile?.avoid ?? undefined,
    notes: jsonProfile?.notes ?? legacyProfile?.archetypeHint ?? undefined,
    archetypeHint: legacyProfile?.archetypeHint ?? undefined,
  };
}

function formatBaselineLine(key: string, entry: RoleBaselineEntry | undefined): string | null {
  if (!entry) return null;
  const label = key.replace(/_/g, " ");
  const segments: string[] = [];
  if (entry.min != null && entry.max != null) {
    segments.push(`${entry.min}-${entry.max}`);
  } else {
    if (entry.min != null) segments.push(`min ${entry.min}`);
    if (entry.max != null) segments.push(`max ${entry.max}`);
  }
  if (entry.recommended != null) segments.push(`rec ${entry.recommended}`);
  let text = `${label} ${segments.join(", ")}`.trim();
  const note = entry.notes?.split(/(?<=\.)\s+/)?.[0];
  if (note) {
    text += ` (${note.replace(/\s+/g, " ")})`;
  }
  return text;
}

function buildCommanderBaselineSummary(format: string): string | null {
  if (format !== "Commander") return null;
  const commanderBaselines = roleBaselineData?.commander;
  if (!commanderBaselines) return null;
  const orderedKeys = ["lands", "ramp", "card_draw", "removal", "board_wipes"];
  const pieces = orderedKeys
    .map((key) => formatBaselineLine(key, commanderBaselines[key]))
    .filter((chunk): chunk is string => Boolean(chunk));
  if (!pieces.length) return null;
  return `Commander baselines: ${pieces.join("; ")}. Use these ranges when evaluating the deck.`;
}

function buildColorIdentitySummary(colors: string[]): string | null {
  if (!colors?.length) return null;
  const unique = Array.from(new Set(colors.map((c) => c.toUpperCase()).filter(Boolean)));
  if (!unique.length) return null;
  const sortedKey = unique.slice().sort().join("");
  const guildLabel = COLOR_PAIR_LABELS[sortedKey];

  if (guildLabel && colorIdentityData[guildLabel]) {
    const info = colorIdentityData[guildLabel];
    const strengths = info.strengths?.join(", ") || "n/a";
    const weaknesses = info.weaknesses?.join(", ") || "n/a";
    return `Color identity: ${guildLabel} (${unique.join("/")}). Strengths: ${strengths}. Weaknesses: ${weaknesses}. Aim suggestions at shoring up the weaknesses.`;
  }

  const strengthSet = new Set<string>();
  const weaknessSet = new Set<string>();
  unique.forEach((symbol) => {
    const info = colorIdentityData[symbol];
    info?.strengths?.forEach((value) => strengthSet.add(value));
    info?.weaknesses?.forEach((value) => weaknessSet.add(value));
  });

  if (!strengthSet.size && !weaknessSet.size) return null;
  const strengths = strengthSet.size ? Array.from(strengthSet).join(", ") : "n/a";
  const weaknesses = weaknessSet.size ? Array.from(weaknessSet).join(", ") : "n/a";
  return `Color identity: ${unique.join("/")}. Strengths: ${strengths}. Weaknesses: ${weaknesses}. Use card choices to cover the gaps.`;
}

function buildCommanderProfileNotes(profile: CommanderProfileEnriched | null): string[] {
  if (!profile) return [];
  const notes: string[] = [];
  if (profile.plan) notes.push(`Commander plan: ${profile.plan}`);
  if (profile.preferTags?.length) notes.push(`Prefer tags: ${profile.preferTags.join(", ")}`);
  if (profile.avoid?.length) notes.push(`Avoid: ${profile.avoid.join(", ")}`);
  if (profile.notes && profile.notes !== profile.plan) notes.push(`Notes: ${profile.notes}`);
  if (profile.mustBePermanent) notes.push("Commander prefers permanent-based support.");
  return notes;
}

function shouldFlagFastMana(powerLevel: string | undefined | null): boolean {
  if (!powerLevel) return true;
  return !/^(?:high(?: power)?|c(?:ed)?h)$/i.test(powerLevel.trim());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    deckText?: string;
    format?: "Commander" | "Modern" | "Pioneer";
    plan?: "Budget" | "Optimized";
    colors?: string[];
    currency?: string;
    commander?: string;
    userMessage?: string;
    useScryfall?: boolean;
    useGPT?: boolean;
  };

  const deckText = String(body.deckText || "").trim();
  const format: "Commander" | "Modern" | "Pioneer" = body.format ?? "Commander";
  const useScryfall = Boolean(body.useScryfall ?? true);
  const useGPT = Boolean(body.useGPT ?? true);

  const parsed = parseDeckText(deckText);
  if (parsed.length === 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "Decklist is empty" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const entries = parsed.map(({ name, qty }) => ({ name, count: qty }));
  const uniqueNames = Array.from(new Set(entries.map((e) => e.name))).slice(0, 160);
  const byName = new Map<string, SfCard>();

  if (useScryfall && uniqueNames.length) {
    const batch = await fetchCardsBatch(uniqueNames);
    for (const card of batch.values()) {
      byName.set(card.name.toLowerCase(), card);
    }
  }

  const reqCommander = typeof body.commander === "string" && body.commander.trim() ? body.commander.trim() : null;
  const explicitColors = Array.isArray(body.colors) ? body.colors : [];

  const context = await inferDeckContext(
    deckText,
    body.userMessage,
    entries,
    format,
    reqCommander,
    explicitColors,
    byName,
    { plan: body.plan ?? "Optimized", currency: (body.currency as any) ?? "USD" }
  );

  const totals = deckTally(entries, byName);
  const totalCardCount = entries.reduce((sum, e) => sum + e.count, 0);
  const bands = computeBands(format, totalCardCount, totals.lands, totals.ramp, totals.draw, totals.removal);
  const score = Math.round((bands.curve + bands.ramp + bands.draw + bands.removal + bands.mana) * 20);

  const whatsGood: string[] = [];
  const quickFixes: string[] = [];

  if (totals.lands >= (format === "Commander" ? 34 : format === "Modern" || format === "Pioneer" ? 22 : 23)) {
    whatsGood.push("Mana base looks stable for this format.");
  } else {
    quickFixes.push("Add a few more lands to smooth your opening hands.");
  }
  if (totals.draw >= 8) {
    whatsGood.push("Card draw density is healthy.");
  } else {
    quickFixes.push("Consider a couple more draw spells to keep gas flowing.");
  }
  if (totals.removal >= 5) {
    whatsGood.push("Interaction package covers common threats.");
  } else {
    quickFixes.push("Add targeted removal so you can answer opposing threats on time.");
  }

  if (format === "Commander" && totals.ramp < 4) {
    quickFixes.push("Most Commander decks use at least 8 ramp sources; look at land-based ramp, mana rocks, or dorks to hit that baseline.");
  }

  let suggestions: CardSuggestion[] = [];
  let filtered: FilteredCandidate[] = [];
  let required = 0;
  let filled = 0;
  let suggestionDebugReasons: Set<string> | null = null;

  if (useGPT) {
    const slots = await planSuggestionSlots(deckText, body.userMessage, context);
    let validation = await validateSlots(slots, context, entries, byName, deckText, body.userMessage, false);
    let normalizedDeck = new Set(entries.map((e) => normalizeCardName(e.name)));
    let profile = getCommanderProfileData(context.commander);
    let post = await postFilterSuggestions(validation.suggestions, context, byName, normalizedDeck, body.currency ?? "USD", entries, null, profile);
    suggestions = post.final;
    filtered = validation.filtered;
    required = validation.required;
    filled = validation.filled;
    suggestionDebugReasons = post.debug;

    if (suggestions.length === 0 && validation.suggestions.length > 0) {
      // Retry with stricter instructions
      validation = await validateSlots(slots, context, entries, byName, deckText, body.userMessage, true);
      normalizedDeck = new Set(entries.map((e) => normalizeCardName(e.name)));
      profile = getCommanderProfileData(context.commander);
      post = await postFilterSuggestions(validation.suggestions, context, byName, normalizedDeck, body.currency ?? "USD", entries, null, profile);
      suggestions = post.final;
      filtered = filtered.concat(validation.filtered);
      suggestionDebugReasons = post.debug;

      if (suggestions.length === 0) {
        suggestions.push({
          card: "N/A",
          reason: "All suggested cards were off-color or banned. The model will retry with stricter rules.",
          needs_review: true,
        });
      }
    }
  }

  const note = totals.draw < 6 ? "needs a touch more draw" : totals.lands < (format === "Commander" ? 32 : 21) ? "mana base is light" : "solid, room to tune";

  return new Response(
    JSON.stringify({
      score,
      note,
      bands,
      counts: { lands: totals.lands, ramp: totals.ramp, draw: totals.draw, removal: totals.removal },
      whatsGood,
      quickFixes,
      curveBuckets: totals.curve,
      suggestions,
      partial: required > 0 && filled < required,
      tokenNeeds: [],
      metaHints: [],
      combosPresent: [],
      combosMissing: [],
      debug: {
        filteredCandidates: filtered,
        filterReasons: suggestionDebugReasons ? Array.from(suggestionDebugReasons) : [],
      },
      prompt_version: useGPT ? getActivePromptVersion() : undefined,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
