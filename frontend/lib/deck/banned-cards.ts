/**
 * Centralized banned card lists for all formats.
 * Single source of truth - imported by all routes that need banned card checking.
 * Data sourced from official banned lists.
 */

import bannedCardsData from '@/lib/data/banned_cards.json';

// Convert arrays to lookup maps for O(1) checking
function arrayToMap(arr: string[]): Record<string, true> {
  const map: Record<string, true> = {};
  for (const card of arr) {
    map[card] = true;
  }
  return map;
}

export const COMMANDER_BANNED: Record<string, true> = arrayToMap(bannedCardsData.Commander);
export const MODERN_BANNED: Record<string, true> = arrayToMap(bannedCardsData.Modern);
export const PIONEER_BANNED: Record<string, true> = arrayToMap(bannedCardsData.Pioneer);
export const STANDARD_BANNED: Record<string, true> = arrayToMap(bannedCardsData.Standard);
export const PAUPER_BANNED: Record<string, true> = arrayToMap(bannedCardsData.Pauper);
export const BRAWL_BANNED: Record<string, true> = arrayToMap(bannedCardsData.Brawl);

// Format-keyed lookup for easier access
export const BANNED_LISTS: Record<string, Record<string, true>> = {
  Commander: COMMANDER_BANNED,
  Modern: MODERN_BANNED,
  Pioneer: PIONEER_BANNED,
  Standard: STANDARD_BANNED,
  Pauper: PAUPER_BANNED,
  Brawl: BRAWL_BANNED,
};

/**
 * Get the banned list for a specific format.
 * Returns null if no banned list exists for the format.
 */
export function getBannedListForFormat(format: string): Record<string, true> | null {
  switch (format.toLowerCase()) {
    case 'commander':
    case 'edh':
      return COMMANDER_BANNED;
    case 'modern':
      return MODERN_BANNED;
    case 'pioneer':
      return PIONEER_BANNED;
    case 'standard':
      return STANDARD_BANNED;
    case 'pauper':
      return PAUPER_BANNED;
    case 'brawl':
      return BRAWL_BANNED;
    default:
      return null;
  }
}

/**
 * Check if a card is banned in the specified format.
 */
export function isCardBanned(cardName: string, format: string): boolean {
  const bannedList = getBannedListForFormat(format);
  if (!bannedList) return false;
  return !!bannedList[cardName];
}

/**
 * Get list of banned card names for a format.
 */
export function getBannedCardNames(format: string): string[] {
  switch (format.toLowerCase()) {
    case 'commander':
    case 'edh':
      return bannedCardsData.Commander;
    case 'modern':
      return bannedCardsData.Modern;
    case 'pioneer':
      return bannedCardsData.Pioneer;
    case 'standard':
      return bannedCardsData.Standard;
    case 'pauper':
      return bannedCardsData.Pauper;
    case 'brawl':
      return bannedCardsData.Brawl;
    default:
      return [];
  }
}
