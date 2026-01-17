// app/api/price/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withLogging } from "@/lib/api/withLogging";
import { ok, err } from "@/lib/api/envelope";
import { PriceBody } from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";

/**
 * Normalize a card name so the client and server use the exact same key.
 * - lowercase
 * - trim
 * - collapse spaces
 * - strip weird quotes and diacritics
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

type Currency = "USD" | "EUR" | "GBP";

type PriceMap = Record<string, number>;

type ScryfallCard = {
  name: string;
  prices: {
    usd: string | null;
    eur: string | null;
    // scryfall does **not** provide gbp; we'll derive it
  };
};

// ---- Simple in-memory cache for FX rates (avoid hammering the API)
let fxCache: {
  at: number;
  USD_EUR: number;
  USD_GBP: number;
} | null = null;

async function getFxRates(): Promise<{ USD_EUR: number; USD_GBP: number }> {
  // Reuse for 4 hours
  const TTL_MS = 4 * 60 * 60 * 1000;
  if (fxCache && Date.now() - fxCache.at < TTL_MS) {
    return { USD_EUR: fxCache.USD_EUR, USD_GBP: fxCache.USD_GBP };
  }

  // exchangerate.host is free/anonymous & very reliable
  const url = "https://api.exchangerate.host/latest?base=USD&symbols=EUR,GBP";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    // very defensive: fall back to safe-ish constants (won't be perfect, but better than 0s)
    const fallback = { USD_EUR: 0.92, USD_GBP: 0.78 };
    fxCache = { at: Date.now(), ...fallback };
    return fallback;
  }
  const data = (await res.json()) as { rates?: { EUR?: number; GBP?: number } };

  const USD_EUR = data?.rates?.EUR ?? 0.92;
  const USD_GBP = data?.rates?.GBP ?? 0.78;

  fxCache = { at: Date.now(), USD_EUR, USD_GBP };
  return { USD_EUR, USD_GBP };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Check price cache for existing prices (24-hour TTL)
 * Note: For use in other routes, import from @/lib/ai/price-utils
 */
async function getCachedPrices(names: string[]): Promise<Record<string, { usd?: number; eur?: number; gbp?: number }>> {
  try {
    const supabase = await createClient();
    const normalizedNames = names.map(normalizeName);
    
    const { data } = await supabase
      .from('price_cache')
      .select('name, usd, eur, gbp, updated_at')
      .in('name', normalizedNames)
      .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // 24 hours ago
    
    const cached: Record<string, { usd?: number; eur?: number; gbp?: number }> = {};
    for (const row of (data || [])) {
      cached[row.name] = {
        usd: row.usd ? Number(row.usd) : undefined,
        eur: row.eur ? Number(row.eur) : undefined,
        gbp: row.gbp ? Number(row.gbp) : undefined
      };
    }
    
    return cached;
  } catch (error) {
    console.warn('Price cache lookup failed:', error);
    return {};
  }
}

/**
 * Cache prices for 24 hours
 */
async function cachePrices(priceData: Record<string, { usd?: number; eur?: number; gbp?: number }>): Promise<void> {
  try {
    const supabase = await createClient();
    
    const rows = Object.entries(priceData).map(([name, prices]) => ({
      name,
      usd: prices.usd || null,
      eur: prices.eur || null,
      gbp: prices.gbp || null,
      updated_at: new Date().toISOString()
    }));
    
    if (rows.length > 0) {
      await supabase
        .from('price_cache')
        .upsert(rows, { onConflict: 'name' });
    }
  } catch (error) {
    console.warn('Price caching failed:', error);
  }
}

/**
 * Fetches one representative printing for each name via Scryfall's collection API.
 * We dedupe the input and cap to Scryfall's limit (75 ids per request).
 */
async function fetchScryfallPrices(names: string[]): Promise<Record<string, ScryfallCard>> {
  const byNorm: Record<string, ScryfallCard> = {};
  const unique = Array.from(new Set(names.map(normalizeName)));

  // Scryfall /cards/collection allows up to 75 identifiers per call
  for (const batch of chunk(unique, 75)) {
    const body = {
      identifiers: batch.map((n) => ({ name: n })),
    };
    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // no-store so we don't get stale prices
      cache: "no-store",
    });

    if (!res.ok) {
      // keep going for other batches; the client will gracefully handle missing prices
      continue;
    }
    const data = (await res.json()) as { data?: ScryfallCard[] };

    for (const c of data?.data ?? []) {
      const norm = normalizeName(c.name);
      // only set the first time we see it (dedupe by normalized name)
      if (!byNorm[norm]) byNorm[norm] = c;
    }
  }

  return byNorm;
}

/**
 * Compute a numeric unit price in the desired currency with fallbacks.
 *  - USD/EUR: use Scryfall direct price; if missing -> convert from USD if available
 *  - GBP: always derived from USD via FX
 */
async function toCurrencyUnit(card: ScryfallCard | undefined, currency: Currency): Promise<number> {
  if (!card) return 0;

  const { USD_EUR, USD_GBP } = await getFxRates();

  const usdRaw = card.prices.usd ? Number(card.prices.usd) : null;
  const eurRaw = card.prices.eur ? Number(card.prices.eur) : null;

  if (currency === "USD") {
    return usdRaw ?? 0;
  }
  if (currency === "EUR") {
    if (eurRaw != null) return eurRaw;
    if (usdRaw != null) return +(usdRaw * USD_EUR).toFixed(2);
    return 0;
  }
  // GBP
  if (usdRaw != null) return +(usdRaw * USD_GBP).toFixed(2);
  if (eurRaw != null) return +(eurRaw * (1 / USD_EUR) * USD_GBP).toFixed(2);
  return 0;
}

export const GET = withLogging(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name');
    const currency = (searchParams.get('currency') || 'USD').toUpperCase() as Currency;

    if (!name) {
      return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 });
    }

    // Use the same POST logic but for a single card
    const names = [name];
    const cachedPrices = await getCachedPrices(names);
    const normName = normalizeName(name);
    
    let priceData = cachedPrices[normName];
    
    // If not in cache, fetch from Scryfall
    if (!priceData) {
      const freshPrices = await fetchScryfallPrices([normName]);
      const card = freshPrices[normName];
      
      if (card) {
        const { USD_EUR, USD_GBP } = await getFxRates();
        const usdRaw = card.prices.usd ? Number(card.prices.usd) : undefined;
        const eurRaw = card.prices.eur ? Number(card.prices.eur) : undefined;
        
        priceData = {
          usd: usdRaw,
          eur: eurRaw || (usdRaw ? Number((usdRaw * USD_EUR).toFixed(2)) : undefined),
          gbp: usdRaw ? Number((usdRaw * USD_GBP).toFixed(2)) : undefined
        };
        
        // Cache it
        await cachePrices({ [normName]: priceData });
      }
    }

    if (!priceData) {
      return NextResponse.json({ ok: true, price: 0, delta_24h: 0, delta_7d: 0, delta_30d: 0 });
    }

    // Convert to requested currency
    const { USD_EUR, USD_GBP } = await getFxRates();
    let price = 0;
    
    if (currency === 'USD' && priceData.usd != null) {
      price = priceData.usd;
    } else if (currency === 'EUR' && priceData.eur != null) {
      price = priceData.eur;
    } else if (currency === 'GBP' && priceData.gbp != null) {
      price = priceData.gbp;
    } else {
      // Fallback conversion to GBP
      const usdRaw = priceData.usd;
      const eurRaw = priceData.eur;
      if (usdRaw != null) price = +(usdRaw * USD_GBP).toFixed(2);
      else if (eurRaw != null) price = +(eurRaw * (1 / USD_EUR) * USD_GBP).toFixed(2);
    }

    // Calculate deltas from price_snapshots table
    let delta_24h = 0;
    let delta_7d = 0;
    let delta_30d = 0;
    
    if (price > 0) {
      try {
        const supabase = await createClient();
        
        // Get latest snapshot date for this currency
        const { data: latestSnap } = await supabase
          .from('price_snapshots')
          .select('snapshot_date')
          .eq('currency', currency)
          .order('snapshot_date', { ascending: false })
          .limit(1);
        
        const latestDate = (latestSnap as any[])?.[0]?.snapshot_date;
        
        if (latestDate) {
          const now = new Date();
          const latest = new Date(latestDate);
          
          // Calculate target dates for 24h, 7d, 30d ago
          const target24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const target7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const target30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          
          // Find closest snapshots to target dates
          const getClosestSnapshot = async (targetDate: Date) => {
            const targetStr = targetDate.toISOString().slice(0, 10);
            const { data } = await supabase
              .from('price_snapshots')
              .select('snapshot_date, unit')
              .eq('currency', currency)
              .eq('name_norm', normName)
              .lte('snapshot_date', targetStr)
              .order('snapshot_date', { ascending: false })
              .limit(1);
            
            return (data as any[])?.[0]?.unit ? Number((data as any[])[0].unit) : null;
          };
          
          const price24h = await getClosestSnapshot(target24h);
          const price7d = await getClosestSnapshot(target7d);
          const price30d = await getClosestSnapshot(target30d);
          
          // Calculate percentage deltas
          if (price24h && price24h > 0) {
            delta_24h = ((price - price24h) / price24h) * 100;
          }
          if (price7d && price7d > 0) {
            delta_7d = ((price - price7d) / price7d) * 100;
          }
          if (price30d && price30d > 0) {
            delta_30d = ((price - price30d) / price30d) * 100;
          }
        }
      } catch (e) {
        console.warn('Delta calculation failed:', e);
        // Continue with 0 deltas if calculation fails
      }
    }
    
    return NextResponse.json({
      ok: true,
      price: price,
      delta_24h: Math.round(delta_24h * 10) / 10, // Round to 1 decimal
      delta_7d: Math.round(delta_7d * 10) / 10,
      delta_30d: Math.round(delta_30d * 10) / 10
    });
  } catch (e: any) {
    console.error('GET /api/price error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
});

export const POST = withLogging(async (req: NextRequest) => {
  try {
    const { names, currency } = (await req.json()) as {
      names: string[];
      currency?: Currency;
    };

    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ ok: true, prices: {}, currency: currency ?? "USD", missing: [] });
    }

    const want: Currency = (currency ?? "USD").toUpperCase() as Currency;

    // Step 1: Check cache for existing prices
    const cachedPrices = await getCachedPrices(names);
    const cacheHits = new Set(Object.keys(cachedPrices));
    
    // Step 2: Identify names that need fresh data
    const uniqueNames = Array.from(new Set(names.map(normalizeName)));
    const needsFresh = uniqueNames.filter(name => !cacheHits.has(name));
    
    console.log(`Price cache: ${cacheHits.size} hits, ${needsFresh.length} misses for ${uniqueNames.length} unique cards`);
    
    // Step 3: Fetch missing prices from Scryfall
    let freshPrices: Record<string, ScryfallCard> = {};
    let newCacheData: Record<string, { usd?: number; eur?: number; gbp?: number }> = {};
    
    if (needsFresh.length > 0) {
      freshPrices = await fetchScryfallPrices(needsFresh);
      
      // Prepare fresh data for caching
      const { USD_EUR, USD_GBP } = await getFxRates();
      
      for (const [normName, card] of Object.entries(freshPrices)) {
        const usdRaw = card.prices.usd ? Number(card.prices.usd) : undefined;
        const eurRaw = card.prices.eur ? Number(card.prices.eur) : undefined;
        const gbpCalculated = usdRaw ? Number((usdRaw * USD_GBP).toFixed(2)) : undefined;
        
        newCacheData[normName] = {
          usd: usdRaw,
          eur: eurRaw || (usdRaw ? Number((usdRaw * USD_EUR).toFixed(2)) : undefined),
          gbp: gbpCalculated
        };
      }
      
      // Cache the fresh data
      await cachePrices(newCacheData);
    }

    // Step 4: Build final response using cached + fresh data
    const prices: PriceMap = {};
    const missing: string[] = [];

    for (const raw of names) {
      const norm = normalizeName(raw);
      let price = 0;
      
      // Try cache first
      if (cachedPrices[norm]) {
        const cached = cachedPrices[norm];
        if (want === "USD" && cached.usd) price = cached.usd;
        else if (want === "EUR" && cached.eur) price = cached.eur;
        else if (want === "GBP" && cached.gbp) price = cached.gbp;
      }
      
      // Fall back to fresh data
      if (price === 0 && newCacheData[norm]) {
        const fresh = newCacheData[norm];
        if (want === "USD" && fresh.usd) price = fresh.usd;
        else if (want === "EUR" && fresh.eur) price = fresh.eur;
        else if (want === "GBP" && fresh.gbp) price = fresh.gbp;
      }
      
      if (price === 0) missing.push(raw);
      prices[norm] = price;
    }

    return NextResponse.json({ 
      ok: true, 
      currency: want, 
      prices, 
      missing,
      cache_stats: {
        hits: cacheHits.size,
        misses: needsFresh.length,
        total: uniqueNames.length
      }
    });
  } catch (err) {
    console.error('Price API error:', err);
    return NextResponse.json(
      {
        ok: false,
        error: "Price lookup failed",
        detail: (err as Error)?.message ?? String(err),
      },
      { status: 200 }
    );
  }
});
