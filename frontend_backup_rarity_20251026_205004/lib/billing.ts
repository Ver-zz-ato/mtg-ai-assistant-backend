import { stripe } from './stripe';

// Product ID mapping (from Stripe Dashboard)
export const PRODUCT_TO_PLAN: Record<string, 'monthly'|'yearly'> = {
  'prod_TDaREGWGBQSSBQ': 'monthly',  // ✅ Verified: Monthly Pro
  'prod_TDaRNmnrBcfWlZ': 'yearly',   // ✅ Verified: Yearly Pro
};

// Plan to Product ID mapping (reverse lookup)
export const PLAN_TO_PRODUCT: Record<'monthly'|'yearly', string> = {
  'monthly': 'prod_TDaREGWGBQSSBQ',  // ✅ Verified: Monthly Pro
  'yearly': 'prod_TDaRNmnrBcfWlZ',   // ✅ Verified: Yearly Pro
};

// Price cache to avoid repeated API calls
const priceCache = new Map<string, { priceId: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get the active price ID for a given product ID
 * Returns the most recently created active recurring price
 */
export async function getPriceIdForProduct(productId: string): Promise<string> {
  // Check cache first
  const cached = priceCache.get(productId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.priceId;
  }

  try {
    // Fetch active prices for the product
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      type: 'recurring',
      limit: 10,
    });

    if (prices.data.length === 0) {
      throw new Error(`No active recurring prices found for product ${productId}`);
    }

    // Sort by created date (newest first) and take the first one
    const sortedPrices = prices.data.sort((a, b) => b.created - a.created);
    const latestPrice = sortedPrices[0];

    // Cache the result
    priceCache.set(productId, {
      priceId: latestPrice.id,
      timestamp: Date.now(),
    });

    return latestPrice.id;
  } catch (error) {
    console.error(`Failed to get price for product ${productId}:`, error);
    throw new Error(`Failed to get price for product ${productId}`);
  }
}

/**
 * Get product ID from plan name
 */
export function getProductIdForPlan(plan: 'monthly' | 'yearly'): string {
  const productId = PLAN_TO_PRODUCT[plan];
  if (!productId) {
    throw new Error(`Unknown plan: ${plan}`);
  }
  return productId;
}

/**
 * Get plan name from product ID
 */
export function getPlanForProductId(productId: string): 'monthly' | 'yearly' {
  const plan = PRODUCT_TO_PLAN[productId];
  if (!plan) {
    throw new Error(`Unknown product ID: ${productId}`);
  }
  return plan;
}

/**
 * Clear the price cache (useful for testing or forced refresh)
 */
export function clearPriceCache(): void {
  priceCache.clear();
}