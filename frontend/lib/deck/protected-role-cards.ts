import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { parseDeckText } from "@/lib/deck/parseDeckText";
import { fetchCard, type SfCard } from "@/lib/deck/inference";

export type ProtectedRoleCategory =
  | "commander"
  | "combo"
  | "wincon"
  | "engine"
  | "tutor"
  | "protection";

export type ProtectedRoleCard = {
  name: string;
  category: ProtectedRoleCategory;
  reason: string;
  confidence: "high" | "medium";
};

const KNOWN_COMBO_PIECES = new Set(
  [
    "thassa's oracle",
    "demonic consultation",
    "tainted pact",
    "food chain",
    "squee, the immortal",
    "misthollow griffin",
    "eternal scourge",
    "underworld breach",
    "brain freeze",
    "lion's eye diamond",
    "isochron scepter",
    "dramatic reversal",
    "kiki-jiki, mirror breaker",
    "zealous conscripts",
    "splinter twin",
    "deceiver exarch",
    "pestermite",
    "walking ballista",
    "heliod, sun-crowned",
    "mikaeus, the unhallowed",
    "triskelion",
    "phyrexian altar",
    "ashnod's altar",
    "altar of dementia",
    "cloudstone curio",
    "peregrine drake",
    "deadeye navigator",
    "freed from the real",
    "pemmin's aura",
    "sanguine bond",
    "exquisite blood",
    "dualcaster mage",
    "twinflame",
    "worldgorger dragon",
    "animate dead",
  ].map(normalizeScryfallCacheName)
);

const KNOWN_PROTECTION = new Set(
  [
    "teferi's protection",
    "heroic intervention",
    "deflecting swat",
    "fierce guardianship",
    "flawless maneuver",
    "swan song",
    "veil of summer",
    "silence",
    "grand abolisher",
  ].map(normalizeScryfallCacheName)
);

const KNOWN_ENGINES = new Set(
  [
    "rhystic study",
    "mystic remora",
    "smothering tithe",
    "skullclamp",
    "the one ring",
    "necropotence",
    "esper sentinel",
    "guardian project",
    "beast whisperer",
    "phyrexian arena",
  ].map(normalizeScryfallCacheName)
);

function addProtected(
  out: Map<string, ProtectedRoleCard>,
  card: ProtectedRoleCard
): void {
  const key = normalizeScryfallCacheName(card.name);
  const existing = out.get(key);
  if (!existing) {
    out.set(key, card);
    return;
  }
  const existingRank = existing.confidence === "high" ? 2 : 1;
  const nextRank = card.confidence === "high" ? 2 : 1;
  if (nextRank > existingRank) out.set(key, card);
}

function classifyProtectedRole(name: string, card: SfCard | null): ProtectedRoleCard | null {
  const key = normalizeScryfallCacheName(name);
  const oracle = String(card?.oracle_text || "").toLowerCase();
  const typeLine = String(card?.type_line || "").toLowerCase();

  if (KNOWN_COMBO_PIECES.has(key)) {
    return { name, category: "combo", reason: "known combo piece or combo enabler", confidence: "high" };
  }

  if (
    /you win the game|can't lose the game|cannot lose the game|opponents? lose the game|each opponent loses/i.test(oracle) ||
    /infinite|combo piece/i.test(name)
  ) {
    return { name, category: "wincon", reason: "explicit win condition or combo payoff", confidence: "high" };
  }

  if (KNOWN_PROTECTION.has(key)) {
    return { name, category: "protection", reason: "protects a key turn, board, commander, or combo", confidence: "high" };
  }

  if (KNOWN_ENGINES.has(key)) {
    return { name, category: "engine", reason: "repeatable card, mana, or resource engine", confidence: "high" };
  }

  if (
    /search your library/i.test(oracle) &&
    !/basic land|land card/i.test(oracle) &&
    !/plains|island|swamp|mountain|forest/i.test(oracle)
  ) {
    return { name, category: "tutor", reason: "tutor effect that finds important pieces", confidence: "medium" };
  }

  if (
    /whenever .*draw|whenever .*cast|whenever .*dies|whenever .*sacrifice|whenever .*token|whenever .*create/i.test(oracle) ||
    /at the beginning of .*draw|the first .* spell|copy .* spell|copy .* activated|double .* token|double .* counter/i.test(oracle)
  ) {
    return { name, category: "engine", reason: "repeatable synergy engine or payoff", confidence: "medium" };
  }

  if (
    /sacrifice .*:/i.test(oracle) ||
    /sacrifice another/i.test(oracle) ||
    /creatures? you control get|tokens? you control|get \+\d\/\+\d/i.test(oracle) ||
    /storm|magecraft|landfall|constellation|prowess/i.test(oracle)
  ) {
    return { name, category: "engine", reason: "archetype enabler or payoff", confidence: "medium" };
  }

  if (/legendary creature/.test(typeLine) && /commander|command zone/i.test(oracle)) {
    return { name, category: "engine", reason: "commander-specific payoff", confidence: "medium" };
  }

  return null;
}

export async function detectProtectedRoleCards(input: {
  deckText: string;
  commander?: string | null;
  limit?: number;
}): Promise<ProtectedRoleCard[]> {
  const entries = parseDeckText(input.deckText || "");
  const limit = input.limit ?? 16;
  const out = new Map<string, ProtectedRoleCard>();

  if (input.commander?.trim()) {
    addProtected(out, {
      name: input.commander.trim(),
      category: "commander",
      reason: "commander or named deck centerpiece",
      confidence: "high",
    });
  }

  const names = Array.from(new Set(entries.map((e) => e.name).filter(Boolean))).slice(0, 180);
  const cards = await Promise.all(names.map(async (name) => ({ name, card: await fetchCard(name).catch(() => null) })));

  for (const { name, card } of cards) {
    const protectedCard = classifyProtectedRole(name, card);
    if (protectedCard) addProtected(out, protectedCard);
  }

  return Array.from(out.values())
    .sort((a, b) => {
      const rank = (c: ProtectedRoleCard) => (c.confidence === "high" ? 2 : 1);
      return rank(b) - rank(a) || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

export function formatProtectedRoleCardsForPrompt(cards: ProtectedRoleCard[]): string {
  if (!cards.length) return "";
  const lines = [
    "DECK ROLE PROTECTION (critical guardrail):",
    "- Treat these as likely deck spine cards. Do NOT recommend cutting them unless the user explicitly asks to cut combo/core pieces, or you replace them with the same strategic role and clearly warn about the risk.",
    "- If one appears weak in isolation, first explain its protected role in the deck before suggesting changes.",
  ];
  for (const card of cards.slice(0, 16)) {
    lines.push(`- ${card.name}: ${card.category}; ${card.reason}; confidence=${card.confidence}`);
  }
  return lines.join("\n");
}

export async function buildProtectedRoleCardsPrompt(input: {
  deckText: string;
  commander?: string | null;
  limit?: number;
}): Promise<string> {
  const cards = await detectProtectedRoleCards(input);
  return formatProtectedRoleCardsForPrompt(cards);
}
