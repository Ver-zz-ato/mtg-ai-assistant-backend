/**
 * Canonical deck role classifier.
 *
 * This is the shared layer AI routes should use before prompting or scoring.
 * Keep low-level Scryfall/oracle rules in card-role-tags.ts; keep route-specific
 * wording in each route.
 */

import type { EnrichedCard } from "./deck-enrichment";
import { isLandForDeck, tagCard, type TaggedCard } from "./card-role-tags";

export type CanonicalDeckRole =
  | "land"
  | "ramp"
  | "draw"
  | "tutor"
  | "removal"
  | "interaction"
  | "protection"
  | "recursion"
  | "graveyard"
  | "token"
  | "engine"
  | "combo"
  | "wincon"
  | "fixing"
  | "hate";

export type RoleClassification = {
  card: TaggedCard;
  roles: CanonicalDeckRole[];
  tags: string[];
};

export type DeckRoleSummary = {
  cardCount: number;
  quantityCount: number;
  byRole: Record<CanonicalDeckRole, number>;
  cardsByRole: Record<CanonicalDeckRole, string[]>;
};

const EMPTY_ROLE_COUNTS: Record<CanonicalDeckRole, number> = {
  land: 0,
  ramp: 0,
  draw: 0,
  tutor: 0,
  removal: 0,
  interaction: 0,
  protection: 0,
  recursion: 0,
  graveyard: 0,
  token: 0,
  engine: 0,
  combo: 0,
  wincon: 0,
  fixing: 0,
  hate: 0,
};

const EMPTY_ROLE_CARDS: Record<CanonicalDeckRole, string[]> = {
  land: [],
  ramp: [],
  draw: [],
  tutor: [],
  removal: [],
  interaction: [],
  protection: [],
  recursion: [],
  graveyard: [],
  token: [],
  engine: [],
  combo: [],
  wincon: [],
  fixing: [],
  hate: [],
};

const TAG_TO_ROLES: Record<string, CanonicalDeckRole[]> = {
  ramp: ["ramp"],
  land_ramp: ["ramp"],
  mana_rock: ["ramp"],
  mana_dork: ["ramp"],
  draw: ["draw"],
  impulse_draw: ["draw"],
  repeatable_draw: ["draw", "engine"],
  tutor: ["tutor"],
  counterspell: ["interaction", "removal"],
  spot_removal: ["interaction", "removal"],
  board_wipe: ["interaction", "removal"],
  protection: ["protection", "interaction"],
  recursion: ["recursion", "graveyard"],
  graveyard_setup: ["graveyard"],
  sac_outlet: ["engine"],
  death_payoff: ["engine", "wincon"],
  token_producer: ["token"],
  token_payoff: ["token", "engine"],
  etb_enabler: ["engine"],
  blink: ["protection", "engine"],
  stax: ["interaction"],
  finisher: ["wincon"],
  combo_piece: ["combo", "wincon"],
  engine: ["engine"],
  payoff: ["engine", "wincon"],
  fixing: ["fixing"],
  utility_land: ["land"],
  graveyard_hate: ["hate", "interaction"],
  artifact_hate: ["hate", "interaction", "removal"],
};

export function classifyCardRoles(card: EnrichedCard | TaggedCard): RoleClassification {
  const tagged = Array.isArray((card as TaggedCard).tags) ? (card as TaggedCard) : tagCard(card);
  const roles = new Set<CanonicalDeckRole>();
  if (isLandForDeck(tagged)) roles.add("land");
  for (const t of tagged.tags) {
    for (const r of TAG_TO_ROLES[t.tag] || []) roles.add(r);
  }
  return {
    card: tagged,
    roles: Array.from(roles),
    tags: tagged.tags.map((t) => t.tag),
  };
}

export function hasDeckRole(card: EnrichedCard | TaggedCard, role: CanonicalDeckRole): boolean {
  return classifyCardRoles(card).roles.includes(role);
}

export function summarizeDeckRoles(cards: Array<EnrichedCard | TaggedCard>): DeckRoleSummary {
  const byRole = { ...EMPTY_ROLE_COUNTS };
  const cardsByRole = Object.fromEntries(
    Object.entries(EMPTY_ROLE_CARDS).map(([k, v]) => [k, [...v]])
  ) as Record<CanonicalDeckRole, string[]>;

  let quantityCount = 0;
  for (const card of cards) {
    const qty = Math.max(1, Math.floor(Number(card.qty) || 1));
    quantityCount += qty;
    const cls = classifyCardRoles(card);
    for (const role of cls.roles) {
      byRole[role] += qty;
      if (cardsByRole[role].length < 8) cardsByRole[role].push(card.name);
    }
  }

  return {
    cardCount: cards.length,
    quantityCount,
    byRole,
    cardsByRole,
  };
}

export function formatRoleSummaryForPrompt(summary: DeckRoleSummary): string {
  const b = summary.byRole;
  return [
    `Canonical role counts by quantity: lands=${b.land}, ramp=${b.ramp}, draw=${b.draw}, tutor=${b.tutor}, removal=${b.removal}, interaction=${b.interaction}, protection=${b.protection}, recursion=${b.recursion}, engine=${b.engine}, combo=${b.combo}, wincon=${b.wincon}, fixing=${b.fixing}, hate=${b.hate}.`,
    `Use these counts as grounding. Do not replace a scarce role unless the replacement fills that same role.`,
  ].join("\n");
}
