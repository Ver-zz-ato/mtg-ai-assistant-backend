/**
 * Rule-based role tagging with confidence and source.
 * Rules are centralised, named, testable, composable, confidence-scored.
 */

import type { EnrichedCard } from "./deck-enrichment";

export type TagWithMeta = {
  tag: string;
  confidence: number;
  source: string;
};

export type TaggedCard = EnrichedCard & {
  tags: TagWithMeta[];
};

const SOURCE_ORACLE_REGEX = "oracle_regex";
const SOURCE_TYPE_LINE = "type_line";
const SOURCE_MANA_COST = "mana_cost";
const SOURCE_HEURISTIC = "heuristic";

function tag(
  tag: string,
  confidence: number,
  source: string
): TagWithMeta {
  return { tag, confidence, source };
}

// --- Composable tag rules ---

function checkRamp(card: EnrichedCard): TagWithMeta | null {
  const o = (card.oracle_text || "").toLowerCase();
  const n = (card.name || "").toLowerCase();
  if (/add \{[wubrgxc]+\}/i.test(o) || /add one mana of any color/i.test(o)) {
    return tag("ramp", 0.95, SOURCE_ORACLE_REGEX);
  }
  if (/search your library for (a|up to \d+)\s*(?:basic\s+)?land/i.test(o)) {
    return tag("land_ramp", 0.92, SOURCE_ORACLE_REGEX);
  }
  if (/signet|talisman|sol ring|mana rock|arcane signet/i.test(n)) {
    return tag("mana_rock", 0.9, SOURCE_HEURISTIC);
  }
  const tl = (card.type_line || "").toLowerCase();
  if (tl.includes("creature") && /add \{[wubrg]+\}|add one mana/i.test(o)) {
    return tag("mana_dork", 0.88, SOURCE_ORACLE_REGEX);
  }
  return null;
}

function checkDraw(card: EnrichedCard): TagWithMeta | null {
  const o = (card.oracle_text || "").toLowerCase();
  if (/draw a card/i.test(o) && !/each opponent draws/i.test(o)) {
    return tag("draw", 0.9, SOURCE_ORACLE_REGEX);
  }
  if (/exile.*cards?.*(?:from the top|until).*cast/i.test(o) || /impulse|exile the top/i.test(o)) {
    return tag("impulse_draw", 0.85, SOURCE_ORACLE_REGEX);
  }
  if (/draw a card.*(?:whenever|when|each (?:turn|end step))/i.test(o) || /whenever you cast.*draw/i.test(o)) {
    return tag("repeatable_draw", 0.88, SOURCE_ORACLE_REGEX);
  }
  return null;
}

function checkTutor(card: EnrichedCard): TagWithMeta | null {
  const o = (card.oracle_text || "").toLowerCase();
  if (/search your library for (a card|a permanent|an? \w+)/i.test(o)) {
    return tag("tutor", 0.92, SOURCE_ORACLE_REGEX);
  }
  return null;
}

function checkInteraction(card: EnrichedCard): TagWithMeta | null {
  const o = (card.oracle_text || "").toLowerCase();
  if (/counter target spell/i.test(o) || /counter (?:that|the) spell/i.test(o)) {
    return tag("counterspell", 0.95, SOURCE_ORACLE_REGEX);
  }
  if (/destroy target (?:creature|enchantment|artifact|planeswalker)/i.test(o) || /exile target (?:creature|permanent)/i.test(o)) {
    return tag("spot_removal", 0.9, SOURCE_ORACLE_REGEX);
  }
  if (/destroy all|exile all|each (?:creature|permanent|opponent).*loses|board wipe|wrath/i.test(o)) {
    return tag("board_wipe", 0.92, SOURCE_ORACLE_REGEX);
  }
  if (/hexproof|indestructible|protection from|shroud|ward/i.test(o) && !/destroy.*hexproof/i.test(o)) {
    return tag("protection", 0.8, SOURCE_ORACLE_REGEX);
  }
  return null;
}

function checkRecursion(card: EnrichedCard): TagWithMeta | null {
  const o = (card.oracle_text || "").toLowerCase();
  if (/return target .* from (?:your )?graveyard/i.test(o) || /return .* from (?:your )?graveyard/i.test(o)) {
    return tag("recursion", 0.9, SOURCE_ORACLE_REGEX);
  }
  if (/mill|dredge|entomb|buried alive|reanimate/i.test(o)) {
    return tag("graveyard_setup", 0.85, SOURCE_ORACLE_REGEX);
  }
  return null;
}

function checkAristocrats(card: EnrichedCard): TagWithMeta | null {
  const o = (card.oracle_text || "").toLowerCase();
  if (/sacrifice (a|another|one|target) creature/i.test(o) || /: sacrifice /i.test(o)) {
    return tag("sac_outlet", 0.88, SOURCE_ORACLE_REGEX);
  }
  if (/whenever .* dies|when .* dies|creature.*dies/i.test(o) && /(opponent|loses|gain|draw|create)/i.test(o)) {
    return tag("death_payoff", 0.85, SOURCE_ORACLE_REGEX);
  }
  return null;
}

function checkTokens(card: EnrichedCard): TagWithMeta | null {
  const o = (card.oracle_text || "").toLowerCase();
  if (/create.*token|create a \d+\/\d+/i.test(o)) {
    return tag("token_producer", 0.9, SOURCE_ORACLE_REGEX);
  }
  if (/populate|create a copy of.*token|double.*token/i.test(o)) {
    return tag("token_payoff", 0.8, SOURCE_ORACLE_REGEX);
  }
  return null;
}

function checkETBBlink(card: EnrichedCard): TagWithMeta | null {
  const o = (card.oracle_text || "").toLowerCase();
  const tl = (card.type_line || "").toLowerCase();
  if (/whenever? .* enters the battlefield/i.test(o) || /enters the battlefield.*you may/i.test(o)) {
    return tag("etb_enabler", 0.82, SOURCE_ORACLE_REGEX);
  }
  if (/exile.*return.*to the battlefield|blink|flicker|ephemerate/i.test(o)) {
    return tag("blink", 0.88, SOURCE_ORACLE_REGEX);
  }
  return null;
}

function checkStax(card: EnrichedCard): TagWithMeta | null {
  const o = (card.oracle_text || "").toLowerCase();
  if (/players can't|opponents can't|each opponent.*can't|tap.*doesn't untap/i.test(o)) {
    return tag("stax", 0.75, SOURCE_ORACLE_REGEX);
  }
  return null;
}

function checkFinisher(card: EnrichedCard): TagWithMeta | null {
  const o = (card.oracle_text || "").toLowerCase();
  const cmc = card.cmc ?? 0;
  if (/you win the game|target player loses the game|each opponent loses \d+/i.test(o)) {
    return tag("finisher", 0.95, SOURCE_ORACLE_REGEX);
  }
  if (cmc >= 6 && (card.type_line || "").toLowerCase().includes("creature")) {
    return tag("finisher", 0.6, SOURCE_HEURISTIC);
  }
  return null;
}

function checkComboEngine(card: EnrichedCard): TagWithMeta | null {
  const o = (card.oracle_text || "").toLowerCase();
  if (/infinite|unlimited|any number of times/i.test(o)) {
    return tag("combo_piece", 0.85, SOURCE_ORACLE_REGEX);
  }
  if (/copy.*spell|whenever you cast|whenever .* enters/i.test(o) && (card.type_line || "").toLowerCase().includes("creature")) {
    return tag("engine", 0.7, SOURCE_HEURISTIC);
  }
  if (/whenever|each (?:turn|combat)|at the beginning of (?:your|each)/i.test(o)) {
    return tag("payoff", 0.65, SOURCE_HEURISTIC);
  }
  return null;
}

function checkFixing(card: EnrichedCard): TagWithMeta | null {
  const tl = (card.type_line || "").toLowerCase();
  const o = (card.oracle_text || "").toLowerCase();
  const n = (card.name || "").toLowerCase();
  if (!tl.includes("land")) return null;
  if (/add one mana of any color|tap.*add \{[wubrg]\}/i.test(o)) {
    return tag("fixing", 0.9, SOURCE_ORACLE_REGEX);
  }
  if (/dual|triome|fetch|shock|pathway|battlebond/i.test(n)) {
    return tag("fixing", 0.85, SOURCE_HEURISTIC);
  }
  if (/basic/i.test(tl) || /^(plains|island|swamp|mountain|forest)/i.test(n)) {
    return tag("fixing", 0.75, SOURCE_TYPE_LINE);
  }
  if (!/plains|island|swamp|mountain|forest/i.test(n)) {
    return tag("utility_land", 0.6, SOURCE_HEURISTIC);
  }
  return tag("fixing", 0.7, SOURCE_TYPE_LINE);
}

function checkHate(card: EnrichedCard): TagWithMeta | null {
  const o = (card.oracle_text || "").toLowerCase();
  if (/exile (?:all )?cards? from graveyards?|graveyard|reanimator/i.test(o) && /exile|can't return/i.test(o)) {
    return tag("graveyard_hate", 0.85, SOURCE_ORACLE_REGEX);
  }
  if (/destroy target artifact|exile target artifact|artifact.*can't|artifact.*loses/i.test(o)) {
    return tag("artifact_hate", 0.88, SOURCE_ORACLE_REGEX);
  }
  return null;
}

const RULES: ((c: EnrichedCard) => TagWithMeta | null)[] = [
  checkRamp,
  checkDraw,
  checkTutor,
  checkInteraction,
  checkRecursion,
  checkAristocrats,
  checkTokens,
  checkETBBlink,
  checkStax,
  checkFinisher,
  checkComboEngine,
  checkFixing,
  checkHate,
];

/**
 * Tag an enriched card with role tags (confidence + source).
 */
export function tagCard(card: EnrichedCard): TaggedCard {
  const tags: TagWithMeta[] = [];

  for (const rule of RULES) {
    const t = rule(card);
    if (t && !tags.some((x) => x.tag === t.tag)) {
      tags.push(t);
    }
  }

  return { ...card, tags };
}

/**
 * Tag a list of enriched cards.
 */
export function tagCards(cards: EnrichedCard[]): TaggedCard[] {
  return cards.map(tagCard);
}
