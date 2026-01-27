// lib/deck/banned-cards.ts
// Shared banned cards lookup utilities

import bannedCardsData from "../data/banned_cards.json";

type BannedCardsData = {
  Commander?: string[];
  Modern?: string[];
  Pioneer?: string[];
  Standard?: string[];
  Pauper?: string[];
  Brawl?: string[];
};

const data = bannedCardsData as BannedCardsData;

function createLookupMap(cards: string[] | undefined): Record<string, true> {
  if (!Array.isArray(cards)) return {};
  const map: Record<string, true> = {};
  for (const card of cards) {
    map[card] = true;
  }
  return map;
}

export const COMMANDER_BANNED = createLookupMap(data.Commander);
export const MODERN_BANNED = createLookupMap(data.Modern);
export const PIONEER_BANNED = createLookupMap(data.Pioneer);
export const STANDARD_BANNED = createLookupMap(data.Standard);
export const PAUPER_BANNED = createLookupMap(data.Pauper);
export const BRAWL_BANNED = createLookupMap(data.Brawl);

export const BANNED_LISTS: Record<string, Record<string, true>> = {
  Commander: COMMANDER_BANNED,
  Modern: MODERN_BANNED,
  Pioneer: PIONEER_BANNED,
  Standard: STANDARD_BANNED,
  Pauper: PAUPER_BANNED,
  Brawl: BRAWL_BANNED,
};

