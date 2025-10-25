// lib/chat/actions/pricing.ts
// Pricing integration for chat assistant

export type CardPrice = {
  usd?: number;
  eur?: number;
  gbp?: number;
  delta_24h?: number;
  delta_7d?: number;
  delta_30d?: number;
};

export async function getCardPrice(cardName: string, currency: 'USD' | 'EUR' | 'GBP' = 'GBP'): Promise<CardPrice | null> {
  try {
    const res = await fetch(`/api/price?name=${encodeURIComponent(cardName)}&currency=${currency}`);
    const data = await res.json();
    
    if (!data.ok) {
      return null;
    }
    
    return {
      usd: data.price_usd,
      eur: data.price_eur,
      gbp: data.price_gbp || data.price,
      delta_24h: data.delta_24h || 0,
      delta_7d: data.delta_7d || 0,
      delta_30d: data.delta_30d || 0
    };
  } catch (error) {
    console.error(`Failed to fetch price for ${cardName}:`, error);
    return null;
  }
}

export async function getBulkPrices(cardNames: string[], currency: 'USD' | 'EUR' | 'GBP' = 'GBP'): Promise<Map<string, CardPrice>> {
  try {
    const res = await fetch('/api/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: cardNames, currency })
    });
    
    const data = await res.json();
    
    if (!data.ok || !Array.isArray(data.prices)) {
      return new Map();
    }
    
    const priceMap = new Map<string, CardPrice>();
    
    for (const item of data.prices) {
      if (item.name && item.price != null) {
        priceMap.set(item.name.toLowerCase(), {
          usd: item.price_usd,
          eur: item.price_eur,
          gbp: item.price_gbp || item.price,
          delta_24h: 0,
          delta_7d: 0,
          delta_30d: 0
        });
      }
    }
    
    return priceMap;
  } catch (error) {
    console.error('Failed to fetch bulk prices:', error);
    return new Map();
  }
}

