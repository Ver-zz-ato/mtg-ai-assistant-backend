/**
 * Deterministic MTG Rules / Legality Engine (V1).
 * Provides authoritative facts for commander eligibility, color identity, format legality,
 * and short oracle summaries. Used to ground chat AI rules/legality responses.
 */

import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { isCommanderEligible } from "@/lib/deck/deck-enrichment";

export type CardRulesFact = {
  cardName: string;
  typeLine: string | null;
  commanderEligible: boolean;
  commanderEligibleReason: "legendary_creature" | "oracle_text" | "partner_background" | null;
  colorIdentity: string[];
  legalInCommander: boolean | null;
  oracleSummary: string;
  cacheMiss: boolean;
};

export type CommanderEligibilityFact = {
  eligible: boolean;
  reason: string;
};

export type RulesFactBundle = {
  commander: CardRulesFact | null;
  cards: CardRulesFact[];
  deckColorIdentity: string[];
};

function resolveScryfallName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.includes("//")) return n.split("//")[0].trim();
  return n;
}

function findCardInMap(
  map: Map<string, { type_line?: string; oracle_text?: string; color_identity?: string[]; legalities?: Record<string, string> }>,
  name: string
): { type_line?: string; oracle_text?: string; color_identity?: string[]; legalities?: Record<string, string> } | undefined {
  const n = name.toLowerCase().trim();
  for (const [k, v] of map) {
    if (k.toLowerCase().trim() === n) return v;
    if (k.toLowerCase().replace(/\s+/g, "") === n.replace(/\s+/g, "")) return v;
  }
  return map.size > 0 ? map.get([...map.keys()][0]) : undefined;
}

function inferCommanderEligibleReason(typeLine: string | undefined, oracleText: string | undefined): CardRulesFact["commanderEligibleReason"] {
  if (!typeLine) return null;
  const tl = typeLine.toLowerCase();
  const ot = (oracleText || "").toLowerCase();
  if (tl.includes("legendary creature")) return "legendary_creature";
  if (ot.includes("choose a background") || ot.includes("partner") || ot.includes("friends forever") || ot.includes("doctor's companion")) {
    return "partner_background";
  }
  if (ot.includes("can be your commander")) return "oracle_text";
  return null;
}

/** Short commander-relevant summary; avoids dumping full Oracle. */
function buildOracleSummary(
  typeLine: string | undefined,
  oracleText: string | undefined,
  commanderEligible: boolean,
  reason: CardRulesFact["commanderEligibleReason"]
): string {
  const parts: string[] = [];
  if (typeLine) parts.push(typeLine);
  if (commanderEligible) {
    if (reason === "legendary_creature") parts.push("Legal commander (Legendary Creature).");
    else if (reason === "oracle_text") parts.push("Legal commander via oracle text.");
    else if (reason === "partner_background") parts.push("Legal commander (Partner/Background/companion).");
  }
  if (oracleText && oracleText.length > 0) {
    const excerpt = oracleText.slice(0, 120).replace(/\n/g, " ");
    if (excerpt.length < oracleText.length) parts.push(`Rules: ${excerpt}...`);
    else parts.push(`Rules: ${excerpt}`);
  }
  return parts.length > 0 ? parts.join(" ") : "No data.";
}

/**
 * Get authoritative rules/legality fact for a single card.
 */
export async function getCardRulesFact(cardName: string): Promise<CardRulesFact> {
  const resolved = resolveScryfallName(cardName);
  const map = await getDetailsForNamesCached([resolved]);
  const entry = findCardInMap(map as Map<string, any>, resolved);

  if (!entry) {
    return {
      cardName: resolved,
      typeLine: null,
      commanderEligible: false,
      commanderEligibleReason: null,
      colorIdentity: [],
      legalInCommander: null,
      oracleSummary: "Card not found in cache. Cannot verify.",
      cacheMiss: true,
    };
  }

  const typeLine = entry.type_line ?? undefined;
  const oracleText = entry.oracle_text ?? undefined;
  const eligible = isCommanderEligible(typeLine, oracleText);
  const reason = inferCommanderEligibleReason(typeLine, oracleText);
  const colorIdentity = Array.isArray(entry.color_identity) ? entry.color_identity.map((c: string) => c.toUpperCase()) : [];
  const leg = entry.legalities;
  const legalInCommander = leg?.commander != null ? leg.commander !== "banned" : null;

  return {
    cardName: resolved,
    typeLine: typeLine ?? null,
    commanderEligible: eligible,
    commanderEligibleReason: eligible ? reason : null,
    colorIdentity,
    legalInCommander,
    oracleSummary: buildOracleSummary(typeLine, oracleText, eligible, reason),
    cacheMiss: false,
  };
}

/**
 * Check if a card is commander-eligible.
 */
export async function getCommanderEligibilityFact(cardName: string): Promise<CommanderEligibilityFact> {
  const fact = await getCardRulesFact(cardName);
  if (fact.cacheMiss) {
    return { eligible: false, reason: "Card not found; cannot verify." };
  }
  if (fact.commanderEligible) {
    const r = fact.commanderEligibleReason;
    const reason = r === "legendary_creature" ? "Legendary Creature." : r === "oracle_text" ? "Oracle text allows it as commander." : "Partner/Background/companion.";
    return { eligible: true, reason };
  }
  return { eligible: false, reason: fact.typeLine ? `Not commander-eligible (${fact.typeLine}).` : "Not a Legendary Creature and no oracle override." };
}

/**
 * Check if a card is legal in Commander format.
 */
export async function isLegalInCommander(cardName: string): Promise<boolean | null> {
  const fact = await getCardRulesFact(cardName);
  return fact.legalInCommander;
}

/**
 * Get commander color identity for a card.
 */
export async function getCommanderColorIdentity(cardName: string): Promise<string[]> {
  const fact = await getCardRulesFact(cardName);
  return fact.colorIdentity;
}

/**
 * Build a rules fact bundle for prompt injection.
 * Use when the user asks about commander or specific cards.
 */
export async function getRulesFactBundle(commanderName?: string | null, cardNames?: string[]): Promise<RulesFactBundle> {
  const names: string[] = [];
  if (commanderName) names.push(commanderName);
  if (cardNames?.length) names.push(...cardNames);
  const unique = Array.from(new Set(names.filter(Boolean)));

  const facts = await Promise.all(unique.map((n) => getCardRulesFact(n)));
  const cmdResolved = commanderName ? resolveScryfallName(commanderName).toLowerCase() : "";
  const commanderFact = commanderName && cmdResolved
    ? facts.find((f) => f.cardName.toLowerCase() === cmdResolved || f.cardName.toLowerCase().replace(/\s+/g, "") === cmdResolved.replace(/\s+/g, ""))
    ?? null
    : null;
  const deckColorIdentity = new Set<string>();
  if (commanderFact) commanderFact.colorIdentity.forEach((c) => deckColorIdentity.add(c));
  facts.forEach((f) => f.colorIdentity.forEach((c) => deckColorIdentity.add(c)));

  return {
    commander: commanderFact ?? null,
    cards: facts,
    deckColorIdentity: Array.from(deckColorIdentity),
  };
}

/**
 * Helper for chat: return authoritative facts for rules/legality questions.
 * Call when user asks "can X be commander", "why off-color", "is this legal", etc.
 */
export async function getRulesFactsForChat(commanderName?: string | null, cardName?: string | null): Promise<RulesFactBundle> {
  const cardNames = cardName ? [cardName] : undefined;
  return getRulesFactBundle(commanderName, cardNames);
}

/** Patterns that suggest rules or legality questions. */
const RULES_LEGALITY_PATTERNS = [
  /\bcan\s+(\w+|\[\[[^\]]+\]\])\s+be\s+(a\s+)?(my\s+)?commander\b/i,
  /\b(why\s+)?(is|are)\s+\w+\s+off-?color\b/i,
  /\bis\s+(\w+|\[\[[^\]]+\]\])\s+legal\b/i,
  /\blegal\s+in\s+commander\b/i,
  /\bcommander\s+eligible\b/i,
  /\b(color\s+identity|off-color|violates)\b/i,
  /\b(why\s+)?(can't|cannot)\s+\w+\s+run\s+\w+\b/i,
  /\bbanned\s+in\s+(commander|modern|pioneer)\b/i,
  /\b(is|does)\s+(\w+|\[\[[^\]]+\]\])\s+banned\b/i,
  /\bpartner\s+(with|and)\b/i,
  /\bchoose\s+a\s+background\b/i,
  /\bdoctor'?s\s+companion\b/i,
  /\b(is|are)\s+.+\s+legal\b/i, // "is my commander X actually legal"
  /\bwhat\s+does\s+(\w+|\[\[[^\]]+\]\])\s+do\b/i, // "what does [[card]] do"
];

/**
 * Detect if the user message appears to ask about rules or legality.
 */
export function detectRulesLegalityIntent(text: string): boolean {
  const t = (text || "").trim();
  if (!t || t.length < 5) return false;
  return RULES_LEGALITY_PATTERNS.some((p) => p.test(t));
}

/**
 * Extract card names from user message, e.g. [[Grist]] or "Grist".
 * Returns unique names. Does not validate against Scryfall.
 */
export function extractCardNamesFromMessage(text: string): string[] {
  const names: string[] = [];
  const bracketRe = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = bracketRe.exec(text)) !== null) {
    const n = m[1]?.trim();
    if (n && n.length > 1 && !names.includes(n)) names.push(n);
  }
  return names;
}
