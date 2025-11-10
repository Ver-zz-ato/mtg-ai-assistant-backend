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
  isDuplicate,
  normalizeCardName,
} from "@/lib/deck/mtgValidators";
import { parseDeckText } from "@/lib/deck/parseDeckText";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
  const profile = context.commander ? COMMANDER_PROFILES[context.commander] ?? null : null;
  const promptVersion = getActivePromptVersion();

  const systemPrompt = [
    "You are ManaTap's planning assistant. Decide what slots need card suggestions before naming any cards.",
    "Return STRICT JSON: {\"slots\":[{\"role\":\"...\",\"requestedType\":\"permanent|instant|any\",\"colors\":[\"G\",\"R\"],\"notes\":\"short\",\"quantity\":1}]}"
  ].join("\n");

  const profileNotes = profile
    ? [
        profile.mustBePermanent ? "- Commander prefers permanents." : "",
        profile.preferTags?.length ? `- Synergy tags: ${profile.preferTags.join(", ")}.` : "",
      ].filter(Boolean).join("\n")
    : "";

  const userPrompt = [
    `Format: ${context.format}`,
    `Deck colors: ${context.colors.join(", ") || "Colorless"}`,
    context.commander ? `Commander: ${context.commander}` : "Commander: (none)",
    profileNotes,
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
  userMessage: string | undefined
): Promise<SlotCandidate[]> {
  const profile = context.commander ? COMMANDER_PROFILES[context.commander] ?? null : null;

  const systemPrompt = [
    "You suggest Magic cards for one specific slot.",
    "Always respond with STRICT JSON: {\"candidates\":[{\"name\":\"...\",\"reason\":\"...\"}]}"
  ].join("\n");

  const slotColors = slot.colors?.length ? slot.colors.join(", ") : context.colors.join(", ");

  const userPrompt = [
    `Format: ${context.format}`,
    `Deck colors: ${context.colors.join(", ") || "Colorless"}`,
    slotColors ? `Allowed colors for this slot: ${slotColors}` : "",
    slot.requestedType ? `Requested type: ${slot.requestedType}` : "Requested type: flexible",
    context.commander ? `Commander: ${context.commander}` : "",
    profile?.mustBePermanent ? "Commander profile: prefer permanents." : "",
    profile?.preferTags?.length ? `Synergy tags: ${profile.preferTags.join(", ")}` : "",
    slot.notes ? `Slot note: ${slot.notes}` : "",
    userMessage ? `User prompt: ${userMessage}` : "",
    "Deck excerpt:",
    deckText.slice(0, 1800),
    "",
    "Return the 3 best candidates with short reasons.",
  ].filter(Boolean).join("\n");

  try {
    const raw = await callOpenAI(systemPrompt, userPrompt, { temperature: 0.35, maxTokens: 320 });
    const parsed = extractJsonObject(raw);
    const items = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    return items.slice(0, 5).map((item: any) => ({
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
  userMessage: string | undefined
): Promise<SlotCandidate[]> {
  const systemPrompt = [
    "Previous suggestions failed validation (off-color, wrong type, illegal). Provide stricter replacements.",
    "Return STRICT JSON {\"candidates\":[{\"name\":\"...\",\"reason\":\"...\"}]}"
  ].join("\n");

  const slotColors = slot.colors?.length ? slot.colors.join(", ") : context.colors.join(", ");

  const userPrompt = [
    `Format: ${context.format}`,
    slotColors ? `Colors EXACT: ${slotColors}` : "",
    slot.requestedType ? `Required type: ${slot.requestedType}` : "",
    context.commander ? `Commander: ${context.commander}` : "",
    "Deck excerpt:",
    deckText.slice(0, 1500),
    userMessage ? `User prompt: ${userMessage}` : "",
    "",
    "Return 3 replacements that obey color identity AND requested type strictly.",
  ].filter(Boolean).join("\n");

  try {
    const raw = await callOpenAI(systemPrompt, userPrompt, { temperature: 0.2, maxTokens: 260 });
    const parsed = extractJsonObject(raw);
    const items = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    return items.slice(0, 5).map((item: any) => ({
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
  userMessage: string | undefined
): Promise<{
  suggestions: ValidatedSuggestion[];
  filtered: FilteredCandidate[];
  required: number;
  filled: number;
}> {
  const suggestions: ValidatedSuggestion[] = [];
  const filtered: FilteredCandidate[] = [];
  const deckNormalized = new Set(deckEntries.map((entry) => normalizeCardName(entry.name)));
  const profile = context.commander ? COMMANDER_PROFILES[context.commander] ?? null : null;
  const isCommander = context.format === "Commander";

  for (const slot of slots) {
    const quantity = Math.max(1, slot.quantity ?? 1);
    const baseCandidates = await fetchSlotCandidates(slot, context, deckText, userMessage);
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

        suggestions.push({ name: card.name, reason: candidate.reason, source, slotRole: slot.role });
        deckNormalized.add(normalizedName);
        picked += 1;
      }
    };

    await attempt(baseCandidates, "gpt");
    if (picked < quantity) {
      const retry = await retrySlotCandidates(slot, context, deckText, userMessage);
      await attempt(retry, "retry");
    }
  }

  const required = slots.reduce((sum, slot) => sum + Math.max(1, slot.quantity ?? 1), 0);
  return { suggestions, filtered, required, filled: suggestions.length };
}

async function postFilterSuggestions(
  candidates: ValidatedSuggestion[],
  context: InferredDeckContext,
  byName: Map<string, SfCard>,
  normalizedDeck: Set<string>,
  currency: string,
  deckEntries: Array<{ count: number; name: string }>,
  userId: string | null
): Promise<{ final: CardSuggestion[]; debug: Set<string> }> {
  const removalReasons = new Set<string>();
  const allowedColors = new Set((context.colors.length ? context.colors : ["C"]).map((c) => c.toUpperCase()));
  const final: CardSuggestion[] = [];

  for (const suggestion of candidates) {
    let card = byName.get(suggestion.name.toLowerCase());
    if (!card) {
      const fetched = await fetchCard(suggestion.name);
      if (fetched) {
        card = fetched;
        byName.set(fetched.name.toLowerCase(), fetched);
      }
    }
    if (!card) {
      removalReasons.add("card lookup failed");
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

    if (context.commander) {
      const profile = COMMANDER_PROFILES[context.commander];
      if (profile?.mustBePermanent && !matchesRequestedType(card, "permanent")) {
        removalReasons.add("commander requires permanents");
        continue;
      }
    }

    if (suggestion.requestedType && suggestion.requestedType.toLowerCase() !== "any") {
      if (!matchesRequestedType(card, suggestion.requestedType)) {
        removalReasons.add(`expected ${suggestion.requestedType}`);
        continue;
      }
    }

    const norm = normalizeCardName(card.name);
    if (normalizedDeck.has(norm)) {
      removalReasons.add("duplicate");
      continue;
    }

    normalizedDeck.add(norm);
    final.push({ name: card.name, reason: suggestion.reason, source: suggestion.source });
  }

  if (final.length === 0 && candidates.length > 0) {
    removalReasons.add("all filtered");
  }

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
  const bands = computeBands(format, entries.reduce((sum, e) => sum + e.count, 0), totals.lands, totals.ramp, totals.draw, totals.removal);
  const score = Math.round((bands.curve + bands.ramp + bands.draw + bands.removal + bands.mana) * 20);

  let suggestions: CardSuggestion[] = [];
  let filtered: FilteredCandidate[] = [];
  let required = 0;
  let filled = 0;

  if (useGPT) {
    const slots = await planSuggestionSlots(deckText, body.userMessage, context);
    const validation = await validateSlots(slots, context, entries, byName, deckText, body.userMessage);
    const normalizedDeck = new Set(entries.map((e) => normalizeCardName(e.name)));
    const post = await postFilterSuggestions(validation.suggestions, context, byName, normalizedDeck, body.currency ?? "USD", entries, null);
    suggestions = post.final;
    filtered = validation.filtered;
    required = validation.required;
    filled = validation.filled;
  }

  return new Response(
    JSON.stringify({
      score,
      bands,
      counts: { lands: totals.lands, ramp: totals.ramp, draw: totals.draw, removal: totals.removal },
      curveBuckets: totals.curve,
      suggestions,
      partial: required > 0 && filled < required,
      debug: {
        filteredCandidates: filtered,
      },
      prompt_version: useGPT ? getActivePromptVersion() : undefined,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
