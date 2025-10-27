// frontend/lib/chat/actions/bulk-prices.ts
// Fetch prices for multiple cards at once

export async function getBulkPrices(cardNames: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  
  if (!Array.isArray(cardNames) || cardNames.length === 0) {
    return priceMap;
  }

  try {
    // Batch fetch prices - limit to 20 at a time to avoid overload
    const batch = cardNames.slice(0, 20);
    
    const results = await Promise.all(
      batch.map(async (name) => {
        try {
          const res = await fetch(`/api/price?name=${encodeURIComponent(name)}&currency=USD`);
          if (!res.ok) return { name, price: null };
          const data = await res.json();
          return { name, price: data.price || null };
        } catch {
          return { name, price: null };
        }
      })
    );

    for (const result of results) {
      if (result.price !== null) {
        const normalized = result.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
        priceMap.set(normalized, result.price);
      }
    }

    return priceMap;
  } catch (err) {
    console.warn('[getBulkPrices] Failed to fetch prices:', err);
    return priceMap;
  }
}


