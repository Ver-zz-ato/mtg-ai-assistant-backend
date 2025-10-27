// lib/chat/actions/collection.ts
// Collection integration for chat assistant

export type OwnedCard = {
  name: string;
  qty: number;
  collections: string[];
};

export async function getOwnedCards(cardNames?: string[]): Promise<OwnedCard[]> {
  try {
    // Fetch all user collections
    const res = await fetch('/api/collections/list');
    const data = await res.json();
    
    if (!data.ok || !Array.isArray(data.collections)) {
      return [];
    }
    
    const owned: Map<string, OwnedCard> = new Map();
    
    // For each collection, fetch its cards
    for (const collection of data.collections) {
      try {
        const cardsRes = await fetch(`/api/collections/cards?collection_id=${collection.id}`);
        const cardsData = await cardsRes.json();
        
        if (cardsData.ok && Array.isArray(cardsData.cards)) {
          for (const card of cardsData.cards) {
            const name = card.name.toLowerCase();
            
            // If cardNames filter provided, skip cards not in the list
            if (cardNames && cardNames.length > 0) {
              const included = cardNames.some(n => 
                n.toLowerCase() === name
              );
              if (!included) continue;
            }
            
            if (owned.has(name)) {
              const existing = owned.get(name)!;
              existing.qty += card.qty || 1;
              existing.collections.push(collection.title);
            } else {
              owned.set(name, {
                name: card.name,
                qty: card.qty || 1,
                collections: [collection.title]
              });
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to fetch cards for collection ${collection.id}:`, error);
      }
    }
    
    return Array.from(owned.values());
  } catch (error) {
    console.error('Failed to fetch owned cards:', error);
    return [];
  }
}

export async function checkIfOwned(cardName: string): Promise<{ owned: boolean; collections: string[]; qty: number }> {
  try {
    const owned = await getOwnedCards([cardName]);
    const match = owned.find(c => 
      c.name.toLowerCase() === cardName.toLowerCase()
    );
    
    if (match) {
      return {
        owned: true,
        collections: match.collections,
        qty: match.qty
      };
    }
    
    return { owned: false, collections: [], qty: 0 };
  } catch (error) {
    return { owned: false, collections: [], qty: 0 };
  }
}

