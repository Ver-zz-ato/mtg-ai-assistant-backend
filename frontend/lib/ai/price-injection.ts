/**
 * Price injection utilities for AI responses
 * Extracts card names from AI text and injects prices
 */

/**
 * Extract card names from markdown-formatted text (e.g., **Card Name**)
 */
export function extractCardNames(text: string): string[] {
  const cardNames: string[] = [];
  
  // Match **Card Name** or [[Card Name]] patterns
  const patterns = [
    /\*\*([^*]+)\*\*/g,  // **Card Name**
    /\[\[([^\]]+)\]\]/g,  // [[Card Name]]
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const cardName = match[1].trim();
      if (cardName && cardName.length > 0) {
        cardNames.push(cardName);
      }
    }
  }
  
  // Remove duplicates
  return Array.from(new Set(cardNames));
}

/**
 * Inject prices into AI response text
 * Replaces card mentions with "Card Name ($X.XX)" format
 * Uses the existing price API which handles cache-first, Scryfall fallback
 */
export async function injectPricesIntoResponse(
  responseText: string,
  currency: "USD" | "EUR" | "GBP" = "USD"
): Promise<string> {
  const cardNames = extractCardNames(responseText);
  
  if (cardNames.length === 0) {
    return responseText;
  }
  
  try {
    // Use the existing price API endpoint which handles cache-first logic
    const response = await fetch('/api/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: cardNames, currency }),
    });
    
    const data = await response.json().catch(() => ({}));
    const prices = data.prices || {};
    
    let updatedText = responseText;
    
    // Replace each card mention with price-injected version
    for (const cardName of cardNames) {
      const normalizedName = cardName.toLowerCase().trim().replace(/\s+/g, ' ');
      const price = prices[normalizedName];
      
      if (price && price > 0) {
        const priceStr = price >= 100 ? `$${Math.round(price)}+` : `$${price.toFixed(2)}`;
        
        // Replace **Card Name** with **Card Name** ($X.XX)
        const pattern1 = new RegExp(`\\*\\*${escapeRegex(cardName)}\\*\\*`, 'g');
        if (pattern1.test(updatedText)) {
          updatedText = updatedText.replace(pattern1, `**${cardName}** (${priceStr})`);
        }
        
        // Replace [[Card Name]] with [[Card Name]] ($X.XX)
        const pattern2 = new RegExp(`\\[\\[${escapeRegex(cardName)}\\]\\]`, 'g');
        if (pattern2.test(updatedText)) {
          updatedText = updatedText.replace(pattern2, `[[${cardName}]] (${priceStr})`);
        }
      }
    }
    
    return updatedText;
  } catch (error) {
    console.warn('[price-injection] Failed to inject prices:', error);
    return responseText; // Return original on error
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
