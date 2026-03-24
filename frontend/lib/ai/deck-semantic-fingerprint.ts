/**
 * Deck Semantic Fingerprint: oracle-text-based signals for improved deck understanding.
 * Uses scryfall_cache (cache-only, no live Scryfall). Fail-open: partial data or errors → continue.
 *
 * Kill-switch: DISABLE_DECK_SEMANTIC_FINGERPRINT=1
 */

import {
  getDetailsForNamesCacheOnly,
  type CacheOnlyCardDetails,
} from "@/lib/server/scryfallCache";

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveScryfallName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.includes("//")) return n.split("//")[0].trim();
  return n;
}

export type DeckSemanticFingerprint = {
  version: 1;
  cardCountAnalyzed: number;
  oracleCoverage: number;
  signals: {
    flash: number;
    opponentTurnPlay: number;
    exileCast: number;
    opponentCardsMatter: number;
    tribalElf: number;
    tribalFaerie: number;
    tokenGoWide: number;
    overrunFinisher: number;
    sacrifice: number;
    graveyardRecursion: number;
    instantSpeedInteraction: number;
    ramp: number;
    drawValue: number;
  };
  detectedThemes: string[];
  likelyGamePlans: string[];
  notableCards: string[];
};

const EMPTY_SIGNALS = {
  flash: 0,
  opponentTurnPlay: 0,
  exileCast: 0,
  opponentCardsMatter: 0,
  tribalElf: 0,
  tribalFaerie: 0,
  tokenGoWide: 0,
  overrunFinisher: 0,
  sacrifice: 0,
  graveyardRecursion: 0,
  instantSpeedInteraction: 0,
  ramp: 0,
  drawValue: 0,
};

export type DeckCardInput = { name: string; count?: number } | string;

function toEntries(cards: DeckCardInput[]): Array<{ name: string; count: number }> {
  return cards.map((c) =>
    typeof c === "string"
      ? { name: c.trim(), count: 1 }
      : { name: String(c?.name || "").trim(), count: Math.max(1, Number(c?.count) || 1) }
  );
}

/** Check oracle text (case-insensitive). */
function hasOracle(ot: string | undefined, patterns: string[]): boolean {
  const t = (ot || "").toLowerCase();
  return patterns.some((p) => t.includes(p.toLowerCase()));
}

/** Check type_line (case-insensitive). */
function hasType(typeLine: string | undefined, substr: string): boolean {
  return (typeLine || "").toLowerCase().includes(substr.toLowerCase());
}

/** Scryfall oracle keyword list (e.g. "Flash"). Case-insensitive exact match. */
function hasOracleKeyword(keywords: string[] | undefined, canonical: string): boolean {
  if (!keywords?.length) return false;
  const want = canonical.toLowerCase();
  return keywords.some((k) => String(k).toLowerCase() === want);
}

/** Prefer cache `is_instant`; else `type_line` substring (unchanged legacy). */
function isInstantForFingerprint(row: CacheOnlyCardDetails, tlLower: string): boolean {
  if (row.is_instant === true) return true;
  if (row.is_instant === false) return false;
  return tlLower.includes("instant");
}

/** Prefer cache `is_sorcery`; else `type_line` substring (unchanged legacy). */
function isSorceryForFingerprint(row: CacheOnlyCardDetails, tlLower: string): boolean {
  if (row.is_sorcery === true) return true;
  if (row.is_sorcery === false) return false;
  return tlLower.includes("sorcery");
}

/**
 * Compute deck semantic fingerprint from card list.
 * Fetches oracle_text, type_line from scryfall_cache in ONE query. Fail-open on errors.
 */
export async function computeDeckSemanticFingerprint(
  cards: DeckCardInput[],
  _supabase?: unknown
): Promise<DeckSemanticFingerprint> {
  const entries = toEntries(cards).filter((e) => e.name.length > 0);
  if (entries.length === 0) {
    return {
      version: 1,
      cardCountAnalyzed: 0,
      oracleCoverage: 0,
      signals: { ...EMPTY_SIGNALS },
      detectedThemes: [],
      likelyGamePlans: [],
      notableCards: [],
    };
  }

  const totalSlots = entries.reduce((s, e) => s + e.count, 0);
  const uniqueNames = Array.from(new Set(entries.map((e) => resolveScryfallName(e.name))));
  const namesToFetch = uniqueNames.filter(Boolean);
  if (namesToFetch.length === 0) {
    return {
      version: 1,
      cardCountAnalyzed: entries.length,
      oracleCoverage: 0,
      signals: { ...EMPTY_SIGNALS },
      detectedThemes: [],
      likelyGamePlans: [],
      notableCards: entries.slice(0, 5).map((e) => e.name),
    };
  }

  let cacheMap: Map<string, CacheOnlyCardDetails> = new Map();
  try {
    cacheMap = await getDetailsForNamesCacheOnly(namesToFetch);
  } catch (_) {
    return {
      version: 1,
      cardCountAnalyzed: entries.length,
      oracleCoverage: 0,
      signals: { ...EMPTY_SIGNALS },
      detectedThemes: [],
      likelyGamePlans: [],
      notableCards: entries.slice(0, 5).map((e) => e.name),
    };
  }

  const slotsWithOracle = entries.filter((e) => {
    const key = norm(resolveScryfallName(e.name));
    const row = cacheMap.get(key);
    return !!(row?.oracle_text || row?.type_line);
  }).reduce((s, e) => s + e.count, 0);
  const oracleCoverage = totalSlots > 0 ? slotsWithOracle / totalSlots : 0;

  const signalCounts = { ...EMPTY_SIGNALS };
  const notableCards: string[] = [];

  for (const { name, count } of entries) {
    const resolved = resolveScryfallName(name);
    const key = norm(resolved);
    const row = cacheMap.get(key);
    const ot = row?.oracle_text ?? "";
    const tl = row?.type_line ?? "";

    if (!row) continue;

    const otLower = ot.toLowerCase();
    const tlLower = tl.toLowerCase();

    if (
      hasOracle(ot, ["flash", "as though they had flash", "any time you could cast an instant"]) ||
      hasOracleKeyword(row.keywords, "Flash")
    ) {
      signalCounts.flash += count;
    }
    if (
      hasOracle(ot, [
        "during each opponent's turn",
        "during an opponent's turn",
        "whenever you cast a spell during an opponent's turn",
      ])
    ) {
      signalCounts.opponentTurnPlay += count;
    }
    if (
      hasOracle(ot, ["you may cast spells from exile", "you may play cards exiled", "cast from exile"])
    ) {
      signalCounts.exileCast += count;
    }
    if (
      hasOracle(ot, [
        "exile the top card of target opponent",
        "you may play cards from opponents",
        "exile target opponent",
      ])
    ) {
      signalCounts.opponentCardsMatter += count;
    }
    if (hasType(tl, "elf")) {
      signalCounts.tribalElf += count;
    }
    if (hasType(tl, "faerie")) {
      signalCounts.tribalFaerie += count;
    }
    if (otLower.includes("create") && (otLower.includes("token") || otLower.includes("tokens"))) {
      signalCounts.tokenGoWide += count;
    }
    if (
      hasOracle(ot, [
        "creatures you control get",
        "all creatures get",
        "each creature gets",
        "+1/+1 until end of turn",
        "trample",
        "haste",
      ]) &&
      (isInstantForFingerprint(row, tlLower) || isSorceryForFingerprint(row, tlLower))
    ) {
      signalCounts.overrunFinisher += count;
    }
    if (hasOracle(ot, ["sacrifice", "whenever you sacrifice"])) {
      signalCounts.sacrifice += count;
    }
    if (
      hasOracle(ot, [
        "return from graveyard",
        "return from your graveyard",
        "return target card from your graveyard",
      ])
    ) {
      signalCounts.graveyardRecursion += count;
    }
    if (
      hasOracle(ot, [
        "counter target",
        "destroy target",
        "exile target",
        "return target",
      ]) &&
      (isInstantForFingerprint(row, tlLower) || otLower.includes("any time you could cast an instant"))
    ) {
      signalCounts.instantSpeedInteraction += count;
    }
    if (
      hasOracle(ot, [
        "add ",
        "search your library for",
        "put a land",
        "you may put a land",
        "ramp",
        "mana",
      ]) ||
      (tlLower.includes("mana") && !tlLower.includes("mana cost"))
    ) {
      signalCounts.ramp += count;
    }
    if (hasOracle(ot, ["draw a card", "draw cards", "draw X cards"])) {
      signalCounts.drawValue += count;
    }

    const contributesToTheme =
      hasOracle(ot, ["flash", "as though they had flash"]) ||
      hasOracleKeyword(row.keywords, "Flash") ||
      hasOracle(ot, ["during each opponent's turn", "during an opponent's turn"]) ||
      hasOracle(ot, ["you may cast spells from exile", "exile the top card of target opponent"]) ||
      hasType(tl, "elf") ||
      hasType(tl, "faerie") ||
      (otLower.includes("create") && otLower.includes("token")) ||
      hasOracle(ot, ["sacrifice", "whenever you sacrifice"]) ||
      hasOracle(ot, ["return from graveyard", "return from your graveyard"]);
    if (contributesToTheme && notableCards.length < 10) {
      notableCards.push(name);
    }
  }

  const signals: DeckSemanticFingerprint["signals"] = {
    flash: totalSlots > 0 ? Math.min(1, signalCounts.flash / totalSlots) : 0,
    opponentTurnPlay: totalSlots > 0 ? Math.min(1, signalCounts.opponentTurnPlay / totalSlots) : 0,
    exileCast: totalSlots > 0 ? Math.min(1, signalCounts.exileCast / totalSlots) : 0,
    opponentCardsMatter:
      totalSlots > 0 ? Math.min(1, signalCounts.opponentCardsMatter / totalSlots) : 0,
    tribalElf: totalSlots > 0 ? Math.min(1, signalCounts.tribalElf / totalSlots) : 0,
    tribalFaerie: totalSlots > 0 ? Math.min(1, signalCounts.tribalFaerie / totalSlots) : 0,
    tokenGoWide: totalSlots > 0 ? Math.min(1, signalCounts.tokenGoWide / totalSlots) : 0,
    overrunFinisher: totalSlots > 0 ? Math.min(1, signalCounts.overrunFinisher / totalSlots) : 0,
    sacrifice: totalSlots > 0 ? Math.min(1, signalCounts.sacrifice / totalSlots) : 0,
    graveyardRecursion:
      totalSlots > 0 ? Math.min(1, signalCounts.graveyardRecursion / totalSlots) : 0,
    instantSpeedInteraction:
      totalSlots > 0 ? Math.min(1, signalCounts.instantSpeedInteraction / totalSlots) : 0,
    ramp: totalSlots > 0 ? Math.min(1, signalCounts.ramp / totalSlots) : 0,
    drawValue: totalSlots > 0 ? Math.min(1, signalCounts.drawValue / totalSlots) : 0,
  };

  const detectedThemes: string[] = [];
  if (signals.flash >= 0.2 || signals.opponentTurnPlay >= 0.15) detectedThemes.push("flash/instant-speed");
  if (signals.exileCast >= 0.15 || signals.opponentCardsMatter >= 0.15)
    detectedThemes.push("exile/theft");
  if (signals.tribalElf >= 0.1) detectedThemes.push("elf tribal");
  if (signals.tribalFaerie >= 0.1) detectedThemes.push("faerie tribal");
  if (signals.tokenGoWide >= 0.15) detectedThemes.push("tokens/go-wide");
  if (signals.sacrifice >= 0.15) detectedThemes.push("aristocrats");
  if (signals.graveyardRecursion >= 0.15) detectedThemes.push("graveyard recursion");
  if (detectedThemes.length === 0) detectedThemes.push("general");

  const likelyGamePlans: string[] = [];
  if (signals.flash >= 0.25 || signals.opponentTurnPlay >= 0.2)
    likelyGamePlans.push("flash/instant-speed during opponents' turns");
  if (signals.exileCast >= 0.2 || signals.opponentCardsMatter >= 0.2)
    likelyGamePlans.push("exile-matters / theft");
  if (signals.tribalElf >= 0.12) likelyGamePlans.push("elf swarm");
  if (signals.tribalFaerie >= 0.12) likelyGamePlans.push("faerie tribal");
  if (signals.tokenGoWide >= 0.2) likelyGamePlans.push("token go-wide");
  if (signals.sacrifice >= 0.2) likelyGamePlans.push("aristocrats/sacrifice");
  if (signals.graveyardRecursion >= 0.2) likelyGamePlans.push("graveyard recursion");
  if (signals.overrunFinisher >= 0.12) likelyGamePlans.push("overrun/pump finisher");
  if (likelyGamePlans.length === 0) likelyGamePlans.push("value/grind");

  const finalNotable =
    notableCards.length > 0
      ? notableCards.slice(0, 8)
      : entries.slice(0, 5).map((e) => e.name);

  return {
    version: 1,
    cardCountAnalyzed: entries.length,
    oracleCoverage: Math.round(oracleCoverage * 100) / 100,
    signals,
    detectedThemes,
    likelyGamePlans,
    notableCards: finalNotable,
  };
}

/** Format fingerprint for prompt injection. Compact, no raw oracle text. */
export function formatFingerprintForPrompt(fp: DeckSemanticFingerprint): string {
  const lines: string[] = ["DECK SEMANTIC FINGERPRINT:"];
  lines.push(`- oracle coverage: ${(fp.oracleCoverage * 100).toFixed(0)}%`);
  if (fp.detectedThemes.length > 0) {
    lines.push(`- likely themes: ${fp.detectedThemes.join(", ")}`);
  }
  if (fp.likelyGamePlans.length > 0) {
    lines.push(`- likely game plans: ${fp.likelyGamePlans.join("; ")}`);
  }
  const sigs = Object.entries(fp.signals)
    .filter(([, v]) => v >= 0.1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k}=${v.toFixed(2)}`);
  if (sigs.length > 0) {
    lines.push(`- signals: ${sigs.join(", ")}`);
  }
  return lines.join("\n");
}
