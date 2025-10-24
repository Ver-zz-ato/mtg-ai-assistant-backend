// lib/chat/actions/wishlist.ts
// Wishlist integration for chat assistant

export async function addToWishlist(cardName: string, qty: number = 1): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/wishlists/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cardName, qty })
    });
    
    const data = await res.json();
    return data;
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to add to wishlist' };
  }
}

export async function removeFromWishlist(cardName: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/wishlists/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cardName })
    });
    
    const data = await res.json();
    return data;
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to remove from wishlist' };
  }
}

export async function getWishlist(): Promise<{ ok: boolean; items?: any[]; error?: string }> {
  try {
    const res = await fetch('/api/wishlists/items');
    const data = await res.json();
    return data;
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to fetch wishlist' };
  }
}

