// frontend/lib/chat/cardValidator.ts
// Validate and normalize card names using Scryfall fuzzy search

export async function validateAndNormalizeCardName(input: string): Promise<string | null> {
  try {
    // First try: exact match from our cache
    const cacheRes = await fetch(`/api/cards/search?q=${encodeURIComponent(input)}&limit=1`);
    if (cacheRes.ok) {
      const cacheData = await cacheRes.json();
      if (cacheData.cards && cacheData.cards.length > 0) {
        return cacheData.cards[0].name; // Return exact name from cache
      }
    }

    // Second try: Scryfall fuzzy search
    const scryfallRes = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(input)}`);
    if (scryfallRes.ok) {
      const data = await scryfallRes.json();
      if (data.name) {
        return data.name; // Return normalized name from Scryfall
      }
    }

    // Card not found
    return null;
  } catch (error) {
    console.error('[cardValidator] Error:', error);
    return null;
  }
}

