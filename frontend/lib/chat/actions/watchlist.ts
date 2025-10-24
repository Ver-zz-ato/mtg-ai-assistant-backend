// lib/chat/actions/watchlist.ts
// Watchlist integration for chat assistant

export async function addToWatchlist(cardName: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/watchlist/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cardName })
    });
    
    const data = await res.json();
    return data;
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to add to watchlist' };
  }
}

export async function removeFromWatchlist(cardName: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/watchlist/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cardName })
    });
    
    const data = await res.json();
    return data;
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to remove from watchlist' };
  }
}

export async function setTargetPrice(cardName: string, price: number | null): Promise<{ ok: boolean; error?: string }> {
  try {
    // First, we need to get the item ID - this requires fetching the watchlist
    const listRes = await fetch('/api/watchlist/list');
    const listData = await listRes.json();
    
    if (!listData.ok) {
      return { ok: false, error: 'Failed to fetch watchlist' };
    }
    
    const item = listData.items?.find((i: any) => 
      i.name.toLowerCase() === cardName.toLowerCase()
    );
    
    if (!item) {
      return { ok: false, error: 'Card not found in watchlist' };
    }
    
    const res = await fetch('/api/watchlist/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, target_price: price })
    });
    
    const data = await res.json();
    return data;
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to update target price' };
  }
}

