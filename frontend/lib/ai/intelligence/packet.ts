import { parseDeckText } from "@/lib/deck/parseDeckText";
import { buildDeckContextSummary, type DeckContextSummary } from "@/lib/deck/deck-context-summary";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import {
  formatTierCapabilityPrompt,
  getAiTierCapabilities,
  resolveManaTapTier,
  type AiTierCapabilities,
  type ManaTapTier,
} from "@/lib/ai/tier-policy";
import { buildDeckSpine, formatDeckSpineForPrompt, type DeckSpine } from "./deck-spine";
import { isAiIntelligenceFlagEnabled } from "./flags";

export type CollectionFitSummary = {
  mode: "none" | "basic" | "full";
  ownedCount: number;
  missingCount: number;
  buildablePercent: number | null;
  ownedSample: string[];
  missingSample: string[];
};

export type PowerProfile = {
  commanderBracket: "casual" | "upgraded" | "optimized" | "cedh-ish" | "unknown";
  notes: string[];
};

export type ConfirmedDeckMemory = {
  type: string;
  text: string;
};

export type DeckIntelligencePacket = {
  version: "2026-05-12.v1";
  tier: ManaTapTier;
  capabilities: AiTierCapabilities;
  format: string;
  commander: string | null;
  cardCount: number;
  summary: DeckContextSummary | null;
  spine: DeckSpine | null;
  collectionFit: CollectionFitSummary | null;
  powerProfile: PowerProfile | null;
  memories: ConfirmedDeckMemory[];
};

export async function buildDeckIntelligencePacket(input: {
  supabase?: any;
  userId?: string | null;
  isGuest?: boolean | null;
  isPro?: boolean | null;
  deckId?: string | null;
  deckText?: string | null;
  format?: string | null;
  commander?: string | null;
}): Promise<DeckIntelligencePacket | null> {
  const deckText = String(input.deckText || "").trim();
  if (!deckText) return null;
  if (!isAiIntelligenceFlagEnabled("AI_INTELLIGENCE_PACKET")) return null;

  const tier = resolveManaTapTier({ isGuest: input.isGuest, isPro: input.isPro, userId: input.userId });
  const capabilities = getAiTierCapabilities(tier);
  const entries = parseDeckText(deckText);
  const cardCount = entries.reduce((sum, row) => sum + Math.max(0, Number(row.qty) || 0), 0);
  const format = normalizeSupportedFormat(input.format) || "Commander";
  const commander = input.commander?.trim() || null;

  let summary: DeckContextSummary | null = null;
  try {
    summary = await buildDeckContextSummary(deckText, {
      format: format as DeckContextSummary["format"],
      commander,
    });
  } catch {
    summary = null;
  }

  let spine: DeckSpine | null = null;
  if (isAiIntelligenceFlagEnabled("AI_COMBO_GROUNDING")) {
    try {
      spine = await buildDeckSpine({
        deckText,
        commander,
        maxProtectedCards: capabilities.maxProtectedCards,
        maxCombos: capabilities.maxCombos,
      });
    } catch {
      spine = null;
    }
  }

  const collectionFit = isAiIntelligenceFlagEnabled("AI_COLLECTION_AWARE_RECS")
    ? await buildCollectionFitSummary({
        supabase: input.supabase,
        userId: input.userId,
        deckEntries: entries,
        mode: capabilities.includeCollectionFit,
      })
    : null;

  const memories = await loadConfirmedMemories({
    supabase: input.supabase,
    userId: input.userId,
    deckId: input.deckId,
    enabled: capabilities.includeDurableMemories && isAiIntelligenceFlagEnabled("AI_CONFIRMED_MEMORY"),
  });

  return {
    version: "2026-05-12.v1",
    tier,
    capabilities,
    format,
    commander,
    cardCount,
    summary,
    spine,
    collectionFit,
    powerProfile: capabilities.includePowerProfile ? buildPowerProfile({ format, summary, spine }) : null,
    memories,
  };
}

export function formatDeckIntelligencePacketForPrompt(packet: DeckIntelligencePacket | null): string {
  if (!packet) return "";
  const lines: string[] = [
    "MANA TAP DECK INTELLIGENCE PACKET (authoritative grounding):",
    `- Packet version: ${packet.version}`,
    `- Tier: ${packet.tier}`,
    `- Format: ${packet.format}`,
    `- Commander: ${packet.commander || "none / non-Commander"}`,
    `- Card count: ${packet.cardCount}`,
    formatTierCapabilityPrompt(packet.capabilities),
  ];

  if (packet.summary?.deck_facts) {
    const facts = packet.summary.deck_facts;
    lines.push(
      `- Roles: lands=${facts.land_count}, ramp=${facts.ramp_count}, draw=${facts.draw_count}, interaction=${facts.interaction_count}.`,
      `- Archetype candidates: ${(facts.archetype_candidates || []).slice(0, 3).map((a) => `${a.name} ${Math.round(a.score * 100)}%`).join(", ") || "unknown"}.`,
      `- Legality flags: ${(facts.banned_cards || []).length ? `banned/not legal: ${facts.banned_cards.join(", ")}` : "none detected"}.`,
    );
  }

  if (packet.spine) lines.push(formatDeckSpineForPrompt(packet.spine));

  if (packet.collectionFit && packet.collectionFit.mode !== "none") {
    const fit = packet.collectionFit;
    lines.push([
      "COLLECTION FIT:",
      `- Mode: ${fit.mode}; owned=${fit.ownedCount}; missing=${fit.missingCount}; buildable=${fit.buildablePercent == null ? "unknown" : `${fit.buildablePercent}%`}.`,
      fit.ownedSample.length ? `- Owned sample: ${fit.ownedSample.join(", ")}.` : "",
      fit.missingSample.length ? `- Missing sample: ${fit.missingSample.join(", ")}.` : "",
      "- Prefer owned close-fit alternatives before recommending purchases when the user's collection context is available.",
    ].filter(Boolean).join("\n"));
  }

  if (packet.powerProfile) {
    lines.push([
      "POWER / TABLE CONTEXT:",
      `- Inferred Commander bracket: ${packet.powerProfile.commanderBracket}.`,
      ...packet.powerProfile.notes.map((note) => `- ${note}`),
    ].join("\n"));
  }

  if (packet.memories.length > 0) {
    lines.push([
      "CONFIRMED USER / DECK MEMORIES:",
      ...packet.memories.map((memory) => `- ${memory.type}: ${memory.text}`),
    ].join("\n"));
  } else if (packet.capabilities.includeDurableMemories) {
    lines.push("CONFIRMED USER / DECK MEMORIES: none saved yet. If the user states a durable preference, ask before saving it.");
  }

  if (isAiIntelligenceFlagEnabled("AI_STRICT_RECOMMENDATION_VALIDATOR")) {
    lines.push(
      "RECOMMENDATION CONTRACT:",
      "- Every card recommendation should state role, suggested cut/candidate cut, why it improves this list, what gets weaker, legality, owned/missing status when known, budget/price note, and power-level fit.",
      "- Do not recommend cards already in the decklist. Do not cut deck-spine cards casually.",
      "- If recommending a purchase, first check whether collection context shows an owned close-fit alternative.",
    );
  }

  return lines.filter(Boolean).join("\n");
}

async function buildCollectionFitSummary(input: {
  supabase?: any;
  userId?: string | null;
  deckEntries: Array<{ name: string; qty: number }>;
  mode: AiTierCapabilities["includeCollectionFit"];
}): Promise<CollectionFitSummary | null> {
  if (input.mode === "none" || !input.supabase || !input.userId || input.deckEntries.length === 0) {
    return input.mode === "none" ? null : { mode: "none", ownedCount: 0, missingCount: 0, buildablePercent: null, ownedSample: [], missingSample: [] };
  }
  try {
    const { data: collections } = await input.supabase
      .from("collections")
      .select("id")
      .eq("user_id", input.userId)
      .limit(50);
    const ids = Array.isArray(collections) ? collections.map((row: any) => row.id).filter(Boolean) : [];
    if (!ids.length) return { mode: input.mode, ownedCount: 0, missingCount: input.deckEntries.length, buildablePercent: 0, ownedSample: [], missingSample: input.deckEntries.slice(0, 8).map((e) => e.name) };
    const { data: rows } = await input.supabase
      .from("collection_cards")
      .select("name, qty")
      .in("collection_id", ids)
      .limit(5000);
    const owned = new Map<string, number>();
    for (const row of rows || []) {
      const key = normalizeScryfallCacheName(String((row as any).name || ""));
      if (!key) continue;
      owned.set(key, (owned.get(key) || 0) + Math.max(0, Number((row as any).qty) || 0));
    }
    let ownedCount = 0;
    let missingCount = 0;
    const ownedSample: string[] = [];
    const missingSample: string[] = [];
    for (const entry of input.deckEntries) {
      const key = normalizeScryfallCacheName(entry.name);
      const have = owned.get(key) || 0;
      if (have >= Math.max(1, entry.qty || 1)) {
        ownedCount += 1;
        if (ownedSample.length < (input.mode === "full" ? 10 : 5)) ownedSample.push(entry.name);
      } else {
        missingCount += 1;
        if (missingSample.length < (input.mode === "full" ? 10 : 5)) missingSample.push(entry.name);
      }
    }
    const total = ownedCount + missingCount;
    return {
      mode: input.mode,
      ownedCount,
      missingCount,
      buildablePercent: total > 0 ? Math.round((ownedCount / total) * 100) : null,
      ownedSample,
      missingSample,
    };
  } catch {
    return { mode: input.mode, ownedCount: 0, missingCount: 0, buildablePercent: null, ownedSample: [], missingSample: [] };
  }
}

async function loadConfirmedMemories(input: {
  supabase?: any;
  userId?: string | null;
  deckId?: string | null;
  enabled: boolean;
}): Promise<ConfirmedDeckMemory[]> {
  if (!input.enabled || !input.supabase || !input.userId) return [];
  try {
    let query = input.supabase
      .from("deck_memories")
      .select("memory_type,value,scope,deck_id")
      .eq("user_id", input.userId)
      .eq("status", "confirmed")
      .limit(12);
    if (input.deckId) query = query.or(`deck_id.eq.${input.deckId},deck_id.is.null`);
    const { data, error } = await query;
    if (error) return [];
    return (data || []).map((row: any) => ({
      type: String(row.memory_type || row.scope || "preference"),
      text: memoryValueToText(row.value),
    })).filter((row: ConfirmedDeckMemory) => row.text);
  } catch {
    return [];
  }
}

function memoryValueToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return String(obj.text || obj.note || obj.value || JSON.stringify(obj)).slice(0, 240);
  }
  return "";
}

function buildPowerProfile(input: {
  format: string;
  summary: DeckContextSummary | null;
  spine: DeckSpine | null;
}): PowerProfile {
  if (!/commander|edh/i.test(input.format)) {
    return { commanderBracket: "unknown", notes: ["Use 60-card constructed format framing; do not use Commander bracket or pod politics language."] };
  }
  const facts = input.summary?.deck_facts;
  const comboCount = input.spine?.combosPresent.length || 0;
  const tutorCount = facts?.role_counts?.tutor || 0;
  const fastManaHints = input.summary?.card_names?.filter((name) => /mana crypt|mox|sol ring|jeweled lotus|lion's eye diamond/i.test(name)).length || 0;
  let commanderBracket: PowerProfile["commanderBracket"] = "casual";
  if (comboCount >= 2 || tutorCount >= 5 || fastManaHints >= 3) commanderBracket = "optimized";
  if (comboCount >= 3 && tutorCount >= 8) commanderBracket = "cedh-ish";
  else if ((facts?.ramp_count || 0) >= 10 || comboCount >= 1 || tutorCount >= 3) commanderBracket = "upgraded";
  return {
    commanderBracket,
    notes: [
      comboCount ? `${comboCount} complete combo line(s) detected; ask about table tolerance before pushing more infinites.` : "No complete combo line detected from local catalog.",
      tutorCount ? `${tutorCount} tutor-like card(s) detected.` : "Tutor density appears low or unknown.",
    ],
  };
}

function normalizeSupportedFormat(format?: string | null): string | null {
  const raw = String(format || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("commander") || raw === "edh") return "Commander";
  if (raw.includes("modern")) return "Modern";
  if (raw.includes("pioneer")) return "Pioneer";
  if (raw.includes("standard")) return "Standard";
  if (raw.includes("pauper")) return "Pauper";
  return format?.trim() || null;
}
