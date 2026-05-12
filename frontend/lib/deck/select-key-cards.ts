/**
 * Selects 3–5 key non-commander cards for authoritative oracle grounding.
 * AI prepass (strong model) with deterministic heuristic fallback. Fail-open → [].
 */

import { getDetailsForNamesCacheOnly } from "@/lib/server/scryfallCache";
import { callLLM } from "@/lib/ai/unified-llm-client";
import { DEFAULT_FALLBACK_MODEL, DEFAULT_PRO_DECK_MODEL } from "@/lib/ai/default-models";

const MAX_KEY_CARDS = 5;
const AI_TIMEOUT_MS = 12_000;
const DEFAULT_SELECTOR_MODEL = DEFAULT_PRO_DECK_MODEL;

const BASIC_EXACT = new Set(
  [
    "plains",
    "island",
    "swamp",
    "mountain",
    "forest",
    "wastes",
    "snow-covered plains",
    "snow-covered island",
    "snow-covered swamp",
    "snow-covered mountain",
    "snow-covered forest",
  ].map((s) => s.toLowerCase())
);

function normName(n: string): string {
  return String(n || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const k = normName(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n.trim());
  }
  return out;
}

function isBasicLandName(name: string): boolean {
  const n = normName(name);
  if (BASIC_EXACT.has(n)) return true;
  if (/^snow-covered\s+/.test(n)) return true;
  return false;
}

function typeLineIsLand(typeLine: string): boolean {
  return /\bland\b/i.test(String(typeLine || ""));
}

async function loadTypeLineCache(names: string[]): Promise<Map<string, { type_line?: string }>> {
  const merged = new Map<string, { type_line?: string }>();
  const uniq = dedupe(names);
  const CHUNK = 200;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const slice = uniq.slice(i, i + CHUNK);
    try {
      const m = await getDetailsForNamesCacheOnly(slice);
      m.forEach((v, k) => merged.set(k, v));
    } catch {
      /* fail open */
    }
  }
  return merged;
}

/**
 * Filter to nonland, non-basic, non-commander unique names using cache type_line when present.
 */
async function filterGroundingCandidates(cardNames: string[], commander: string | null): Promise<string[]> {
  const deduped = dedupe(cardNames);
  const cmd = commander ? normName(commander) : "";
  let cache: Map<string, { type_line?: string }>;
  try {
    cache = await loadTypeLineCache(deduped);
  } catch {
    cache = new Map();
  }

  const out: string[] = [];
  for (const raw of deduped) {
    if (out.length >= 120) break;
    const k = normName(raw);
    if (!k) continue;
    if (cmd && k === cmd) continue;
    if (isBasicLandName(raw)) continue;
    const row = cache.get(k);
    const tl = row?.type_line ?? "";
    if (tl) {
      if (typeLineIsLand(tl)) continue;
    } else {
      // Cache miss: conservative name heuristics only
      if (/\b(forest|island|swamp|mountain|plains)\b/i.test(raw) && raw.split(/\s+/).length <= 3) continue;
    }
    out.push(raw);
  }
  return out;
}

const HEURISTIC_NAME_BOOST =
  /flash|exile|cast|whenever|each turn|at the beginning|token|blink|sacrifice|copy|storm|untap|extra turn|win the game|mill|graveyard|combo|trigger|static|mana|draw|damage|counter/i;

function heuristicScore(name: string, v2Summary: unknown, fingerprintText: string | null | undefined): number {
  let s = 0;
  const n = name.toLowerCase();
  if (HEURISTIC_NAME_BOOST.test(n)) s += 3;
  if (/sol ring|arcane signet|mana crypt|chrome mox|jeweled lotus/i.test(n)) s += 0.5;
  try {
    const blob = `${JSON.stringify(v2Summary ?? "")} ${fingerprintText ?? ""}`.toLowerCase();
    if (blob.includes(normName(name))) s += 4;
  } catch {
    /* ignore */
  }
  return s;
}

function selectKeyCardsHeuristic(
  candidates: string[],
  commander: string | null,
  v2Summary: unknown,
  fingerprintText: string | null | undefined,
  maxCards: number
): string[] {
  const cmd = commander ? normName(commander) : "";
  const scored = candidates
    .filter((c) => normName(c) !== cmd)
    .map((name) => ({ name, score: heuristicScore(name, v2Summary, fingerprintText) }))
    .sort((a, b) => b.score - a.score);
  const out: string[] = [];
  for (const { name } of scored) {
    if (out.length >= maxCards) break;
    if (!out.some((x) => normName(x) === normName(name))) out.push(name);
  }
  return out.slice(0, maxCards);
}

function parseJsonNameArray(raw: string): string[] | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed.map((s) => String(s).trim()).filter(Boolean);
    }
  } catch {
    /* try extract */
  }
  const m = t.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        return parsed.map((s) => String(s).trim()).filter(Boolean);
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function selectKeyCardsViaAI(params: {
  candidates: string[];
  commander: string | null;
  v2Summary: unknown;
  fingerprintText: string | null | undefined;
  maxCards: number;
}): Promise<string[] | null> {
  const { candidates, commander, v2Summary, fingerprintText, maxCards } = params;
  if (candidates.length === 0) return null;

  const model = process.env.MODEL_KEY_CARD_SELECTOR?.trim() || DEFAULT_SELECTOR_MODEL;

  const compactList = candidates.slice(0, 120).join("; ");
  const summarySnippet =
    v2Summary && typeof v2Summary === "object"
      ? JSON.stringify(v2Summary).slice(0, 3500)
      : "";
  const fpSnippet = (fingerprintText || "").slice(0, 2000);

  const instruction = [
    `Given this Magic: The Gathering deck context, select up to ${maxCards} NON-COMMANDER cards whose EXACT ORACLE TEXT is most critical to correctly understanding how the deck functions.`,
    "",
    "Prioritize:",
    "- Engine pieces that define how the deck generates advantage",
    "- Cards that change timing rules (flash, casting permissions, replacement effects)",
    "- Cards with non-obvious or easily misunderstood mechanics",
    "- Cards that are required for the deck's core interaction loop",
    "",
    "Avoid:",
    "- Lands and mana fixing",
    "- Generic ramp unless it is central to the engine",
    "- Redundant value pieces that do not change how the deck works",
    "",
    "Important:",
    "- Prefer cards that would cause the analysis to be WRONG if misunderstood",
    "- Prefer cards that interact with multiple other cards",
    "- Prefer cards that define the deck's play pattern",
    "",
    "Return ONLY a JSON array of exact card names.",
    "No explanation.",
  ].join("\n");

  const userContent = [
    instruction,
    "",
    "Commander (exclude from output): " + (commander || "none"),
    "Candidate nonland card names (semicolon-separated): " + compactList,
    v2Summary ? "Deck summary JSON (may be truncated): " + summarySnippet : "",
    fingerprintText ? "Fingerprint / theme signals (truncated): " + fpSnippet : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await callLLM(
      [
        { role: "system", content: "You output only valid JSON: a single array of strings." },
        { role: "user", content: userContent },
      ],
      {
        route: "/api/chat",
        feature: "key_card_selector",
        model,
        fallbackModel: DEFAULT_FALLBACK_MODEL,
        timeout: AI_TIMEOUT_MS,
        maxTokens: 400,
        apiType: "chat",
        userId: null,
        isPro: false,
        skipRecordAiUsage: true,
      }
    );

    const arr = parseJsonNameArray(res.text);
    if (!arr?.length) return null;
    return arr.slice(0, maxCards);
  } catch {
    return null;
  }
}

export type SelectKeyCardsParams = {
  cardNames: string[];
  commander?: string | null;
  v2Summary?: unknown | null;
  fingerprintText?: string | null;
  maxCards?: number;
};

/**
 * Returns up to `maxCards` (default 5) card names for grounding, excluding commander and lands.
 */
export async function selectKeyCardsForGrounding(params: SelectKeyCardsParams): Promise<string[]> {
  const maxCards = Math.min(MAX_KEY_CARDS, Math.max(1, params.maxCards ?? MAX_KEY_CARDS));
  const commander = params.commander ?? null;

  try {
    const rawNames = Array.isArray(params.cardNames) ? params.cardNames : [];
    if (rawNames.length === 0) return [];

    let candidates = await filterGroundingCandidates(rawNames, commander);
    if (candidates.length === 0) return [];

    let aiPick: string[] | null = null;
    try {
      aiPick = await selectKeyCardsViaAI({
        candidates,
        commander,
        v2Summary: params.v2Summary ?? null,
        fingerprintText: params.fingerprintText ?? null,
        maxCards,
      });
    } catch {
      aiPick = null;
    }

    let chosen: string[] = [];
    if (aiPick?.length) {
      const cmdN = commander ? normName(commander) : "";
      const byNorm = new Map(candidates.map((c) => [normName(c), c] as const));
      for (const n of aiPick) {
        const nn = normName(n);
        if (!nn || nn === cmdN) continue;
        const canonical = byNorm.get(nn);
        if (canonical) chosen.push(canonical);
      }
      chosen = dedupe(chosen).slice(0, maxCards);
    }

    if (chosen.length === 0) {
      chosen = selectKeyCardsHeuristic(candidates, commander, params.v2Summary ?? null, params.fingerprintText, maxCards);
    }

    return dedupe(chosen).slice(0, maxCards);
  } catch {
    return [];
  }
}
