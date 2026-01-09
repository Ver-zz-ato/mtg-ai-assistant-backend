import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withLogging } from "@/lib/api/withLogging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds for large decks

// Basic types
type Currency = "USD" | "EUR" | "GBP";

function normCur(v: any): Currency {
  const s = String(v || "USD").toUpperCase();
  return (s === "EUR" || s === "GBP") ? (s as Currency) : "USD";
}

function normalizeName(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Cache-aware price fetching
async function getCachedPrices(supabase: any, names: string[]): Promise<Map<string, { usd?: number; eur?: number; gbp?: number }>> {
  const map = new Map<string, { usd?: number; eur?: number; gbp?: number }>();
  if (!names.length) return map;
  
  const normalizedNames = names.map(normalizeName);
  const { data } = await supabase
    .from('price_cache')
    .select('name, usd, eur, gbp')
    .in('name', normalizedNames)
    .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  
  for (const row of (data || [])) {
    map.set(row.name, {
      usd: row.usd ? Number(row.usd) : undefined,
      eur: row.eur ? Number(row.eur) : undefined,
      gbp: row.gbp ? Number(row.gbp) : undefined
    });
  }
  
  return map;
}

async function getCachedCardData(supabase: any, names: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (!names.length) return map;
  
  const normalizedNames = names.map(normalizeName);
  const { data } = await supabase
    .from('scryfall_cache')
    .select('name, type_line, oracle_text, set, set_name, collector_number, scryfall_uri, reprint_count')
    .in('name', normalizedNames)
    .gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // 7 days
  
  for (const row of (data || [])) {
    map.set(row.name, {
      type_line: row.type_line,
      oracle_text: row.oracle_text,
      set: row.set,
      set_name: row.set_name,
      collector_number: row.collector_number,
      scryfall_uri: row.scryfall_uri,
      reprint_count: row.reprint_count
    });
  }
  
  return map;
}

async function cachePrices(supabase: any, priceData: Array<{ name: string; usd?: number; eur?: number; gbp?: number }>): Promise<void> {
  if (!priceData.length) return;
  
  try {
    await supabase
      .from('price_cache')
      .upsert(
        priceData.map(p => ({
          name: normalizeName(p.name),
          usd: p.usd,
          eur: p.eur,
          gbp: p.gbp,
          updated_at: new Date().toISOString()
        })),
        { onConflict: 'name' }
      );
  } catch (error) {
    console.warn('Failed to cache prices:', error);
  }
}

function parseDeckText(text: string): Map<string, { name: string; qty: number }> {
  const map = new Map<string, { name: string; qty: number }>();
  if (!text) return map;
  const rx = /^(\d+)\s*[xX]?\s+(.+)$/;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const m = line.match(rx);
    const qty = m ? Math.max(1, parseInt(m[1]!, 10)) : 1;
    const name = (m ? m[2] : line).trim();
    const key = normalizeName(name);
    const prev = map.get(key);
    if (prev) prev.qty += qty; else map.set(key, { name, qty });
  }
  return map;
}

async function loadOwnedByCollection(supabase: any, collectionId: string): Promise<Map<string, number>> {
  const tables = [
    "collection_cards", // preferred
    "collection_items",
    "collections_items",
    "user_collection_items",
    "cards_in_collection",
  ];
  const owned = new Map<string, number>();
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select("name, card, card_name, qty, owned, count").eq("collection_id", collectionId);
    if (!error && Array.isArray(data)) {
      for (const r of data) {
        const nm = String(r?.name || r?.card || r?.card_name || "").trim();
        const q = Number(r?.qty ?? r?.owned ?? r?.count ?? 0) || 0;
        if (!nm) continue;
        const key = normalizeName(nm);
        owned.set(key, (owned.get(key) || 0) + Math.max(0, q));
      }
      break;
    }
  }
  return owned;
}

async function fetchNamedCard(name: string): Promise<any | null> {
  const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return null;
  return r.json();
}

// PERFORMANCE: Batch fetch cards using Scryfall /cards/collection endpoint (handles up to 75 at a time)
async function fetchCardsBatch(names: string[]): Promise<Map<string, any>> {
  const results = new Map<string, any>();
  if (!names.length) return results;
  
  // Scryfall /cards/collection accepts max 75 cards per request
  const BATCH_SIZE = 75;
  
  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    const batch = names.slice(i, i + BATCH_SIZE);
    
    // Format identifiers for Scryfall collection endpoint
    const identifiers = batch.map(name => ({ name }));
    
    try {
      const response = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers }),
        cache: 'no-store'
      });
      
      if (!response.ok) {
        console.warn(`[Shopping List] Batch fetch failed for batch ${i}-${i + batch.length}`);
        continue;
      }
      
      const json = await response.json().catch(() => ({}));
      const cards = Array.isArray(json?.data) ? json.data : [];
      
      // Map cards by normalized name for lookup
      for (const card of cards) {
        const nameKey = normalizeName(card.name || '');
        if (nameKey) {
          results.set(nameKey, card);
        }
      }
    } catch (error) {
      console.warn(`[Shopping List] Batch fetch error for batch ${i}-${i + batch.length}:`, error);
    }
  }
  
  return results;
}

async function fetchCheapestPrint(baseCard: any, want: Currency): Promise<{ set: string; set_name: string; collector_number: string; price: number; uri: string; prints: number; oracle_text?: string } | null> {
  if (!baseCard) return null;
  const printsUri = baseCard?.prints_search_uri;
  if (!printsUri) {
    // Fallback to current card's price
    const price = pickPrice(baseCard?.prices, want);
    return {
      set: baseCard.set,
      set_name: baseCard.set_name,
      collector_number: baseCard.collector_number,
      price,
      uri: baseCard.uri,
      prints: 1,
      oracle_text: baseCard.oracle_text || baseCard.card_faces?.[0]?.oracle_text || undefined,
    };
  }
  const r = await fetch(printsUri, { cache: "no-store" });
  if (!r.ok) {
    const price = pickPrice(baseCard?.prices, want);
    return {
      set: baseCard.set,
      set_name: baseCard.set_name,
      collector_number: baseCard.collector_number,
      price,
      uri: baseCard.uri,
      prints: 1,
      oracle_text: baseCard.oracle_text || baseCard.card_faces?.[0]?.oracle_text || undefined,
    };
  }
  const j = await r.json().catch(() => ({}));
  const cards: any[] = Array.isArray(j?.data) ? j.data : [];
  const prints = Number(j?.total_cards || cards.length || 0) || cards.length;
  let best: any | null = null;
  let bestP = Number.POSITIVE_INFINITY;
  for (const c of cards) {
    // Only consider non-foil normal prices if available
    const p = pickPrice(c?.prices, want);
    if (p > 0 && p < bestP) { bestP = p; best = c; }
  }
  if (!best) best = baseCard;
  return {
    set: best.set,
    set_name: best.set_name,
    collector_number: best.collector_number,
    price: pickPrice(best?.prices, want),
    uri: best.uri,
    prints,
    oracle_text: best.oracle_text || best.card_faces?.[0]?.oracle_text || undefined,
  };
}

function pickPrice(prices: any, cur: Currency): number {
  if (!prices) return 0;
  const usd = Number(prices.usd || 0) || 0;
  const eur = Number(prices.eur || 0) || 0;
  if (cur === "USD") return usd;
  if (cur === "EUR") return eur || (usd > 0 ? +(usd * 0.92).toFixed(2) : 0);
  // GBP derived from USD
  return usd > 0 ? +(usd * 0.78).toFixed(2) : (eur > 0 ? +(eur * (1/0.92) * 0.78).toFixed(2) : 0);
}

function roleHeuristic(name: string, oracle: string): { role: "ramp"|"draw"|"removal"|"wincon"|"other"; tier: "must_have"|"strong"|"nice_to_have" } {
  const t = oracle || "";
  const drawRe = /draw a card|scry [1-9]/i;
  const rampRe = /add \{[wubrg]\}|search your library for (a|up to .*?) land|signet|talisman|sol ring/i;
  const killRe = /destroy target|exile target|counter target|damage to any target/i;
  if (rampRe.test(t)) return { role: "ramp", tier: "must_have" };
  if (drawRe.test(t)) return { role: "draw", tier: "strong" };
  if (killRe.test(t)) return { role: "removal", tier: "strong" };
  if (/overrun|extra turn|infinite|win the game|combo/i.test(t)) return { role: "wincon", tier: "strong" };
  return { role: "other", tier: "nice_to_have" };
}

function riskDot(prints: number): "green"|"orange"|"red" {
  if (prints >= 9) return "green";
  if (prints >= 5) return "orange";
  return "red";
}

export const POST = withLogging(async (req: NextRequest) => {
  try {
    const supabase = await createClient();
    const { data: u } = await supabase.auth.getUser();
    const user = u?.user || null; // optional auth OK; RLS applies when fetching deck/collection

    const body = await req.json().catch(() => ({} as any));
    const deckId = body.deckId as string | undefined;
    const deckTextIn = body.deckText as string | undefined;
    const collectionId = body.collectionId as string | undefined;
    const useOwned = Boolean(body.useOwned);
    const currency = normCur(body.currency);
    const remainingBudget = typeof body.remainingBudget === "number" ? Math.max(0, body.remainingBudget) : undefined;
    const limit = typeof body.limit === "number" ? Math.max(1, Math.min(100, body.limit)) : undefined;
    const offset = typeof body.offset === "number" ? Math.max(0, body.offset) : 0;

    let deckText = String(deckTextIn || "");
    if (!deckText && deckId) {
      const { data, error } = await supabase.from("decks").select("deck_text").eq("id", deckId).maybeSingle();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      deckText = String(data?.deck_text || "");
    }
    if (!deckText) return NextResponse.json({ ok: false, error: "missing deck" }, { status: 400 });

    const want = parseDeckText(deckText);
    const owned = useOwned && collectionId ? await loadOwnedByCollection(supabase, collectionId) : new Map<string, number>();

    // Get all cards that need to be purchased
    const needed: Array<{ key: string; name: string; qty: number; have: number; to_buy: number }> = [];
    for (const [key, { name, qty }] of want.entries()) {
      const have = owned.get(key) || 0;
      const to_buy = Math.max(0, qty - have);
      if (to_buy > 0) {
        needed.push({ key, name, qty, have, to_buy });
      }
    }

    const totalCount = needed.length;

    // Get cached prices and card data
    const cardNames = needed.map(n => n.name);
    const [priceCache, cardCache] = await Promise.all([
      getCachedPrices(supabase, cardNames),
      getCachedCardData(supabase, cardNames)
    ]);

    // Determine which slice to fetch based on limit/offset
    const startIdx = limit ? offset : 0;
    const endIdx = limit ? Math.min(startIdx + limit, totalCount) : totalCount;
    const toFetch = needed.slice(startIdx, endIdx);

    console.log(`[Shopping List] Total: ${totalCount}, Fetching: ${startIdx}-${endIdx} (${toFetch.length} cards)`);

    const snapshot_ts = new Date().toISOString();
    const items: any[] = [];
    const pricesToCache: Array<{ name: string; usd?: number; eur?: number; gbp?: number }> = [];

    // PERFORMANCE: Batch fetch all missing cards at once instead of one-by-one
    const missingNames: string[] = [];
    const missingCards: Map<string, { key: string; name: string; qty: number; have: number; to_buy: number }> = new Map();
    
    // Identify cards that need fetching (not in cache)
    for (const { key, name, qty, have, to_buy } of toFetch) {
      const normName = normalizeName(name);
      const cachedPrice = priceCache.get(normName);
      const cachedCard = cardCache.get(normName);
      
      // Only add to batch if missing from cache
      if (!cachedCard || !cachedPrice) {
        missingNames.push(name);
        missingCards.set(normName, { key, name, qty, have, to_buy });
      }
    }
    
    // Batch fetch missing cards (up to 75 at a time via Scryfall /cards/collection)
    const batchFetched = missingNames.length > 0 
      ? await fetchCardsBatch(missingNames)
      : new Map<string, any>();

    // Process all cards (cached + batch fetched)
    for (const { key, name, qty, have, to_buy } of toFetch) {
      const normName = normalizeName(name);
      const cachedPrice = priceCache.get(normName);
      const cachedCard = cardCache.get(normName);
      const batchCard = batchFetched.get(normName);

      let price_each = 0;
      let set = null;
      let set_name = null;
      let collector_number = null;
      let oracle_text = cachedCard?.oracle_text || "";
      let uri = `https://scryfall.com/search?q=${encodeURIComponent(name)}`;
      let prints = 0;

      // Priority 1: Use scryfall_cache for EVERYTHING (fast!)
      if (cachedCard && cachedPrice) {
        if (currency === "USD") price_each = cachedPrice.usd || 0;
        else if (currency === "EUR") price_each = cachedPrice.eur || 0;
        else if (currency === "GBP") price_each = cachedPrice.gbp || 0;
        
        // Use cached card data directly
        set = cachedCard.set;
        set_name = cachedCard.set_name;
        collector_number = cachedCard.collector_number;
        uri = cachedCard.scryfall_uri || uri;
        prints = cachedCard.reprint_count || 0;
        
        console.log(`[Shopping List] 🚀 Full cache hit for ${name}: ${price_each}`);
      } 
      // Priority 2: Partial cache - use batch fetched card data
      else if (cachedPrice && batchCard) {
        if (currency === "USD") price_each = cachedPrice.usd || 0;
        else if (currency === "EUR") price_each = cachedPrice.eur || 0;
        else if (currency === "GBP") price_each = cachedPrice.gbp || 0;
        
        console.log(`[Shopping List] ⚡ Partial cache hit for ${name}, using batch fetched details...`);
        
        set = batchCard?.set;
        set_name = batchCard?.set_name;
        collector_number = batchCard?.collector_number;
        uri = batchCard?.scryfall_uri || uri;
        oracle_text = batchCard?.oracle_text || oracle_text;
      }
      // Priority 3: No cache - use batch fetched card, then get cheapest print if needed
      else if (batchCard) {
        console.log(`[Shopping List] ❌ Cache miss for ${name}, using batch fetched card...`);
        
        try {
          const cheapest = await fetchCheapestPrint(batchCard, currency);
          
          price_each = Math.max(0, Number(cheapest?.price || 0));
          set = cheapest?.set || batchCard?.set;
          set_name = cheapest?.set_name || batchCard?.set_name;
          collector_number = cheapest?.collector_number || batchCard?.collector_number;
          oracle_text = cheapest?.oracle_text || batchCard?.oracle_text || oracle_text;
          uri = cheapest?.uri || batchCard?.uri || uri;
          prints = cheapest?.prints || 0;

          // Cache the prices we just fetched
          const prices = batchCard?.prices || {};
          pricesToCache.push({
            name,
            usd: Number(prices.usd || 0) || undefined,
            eur: Number(prices.eur || 0) || undefined,
            gbp: undefined // Scryfall doesn't provide GBP
          });
        } catch (error) {
          console.warn(`[Shopping List] Failed to process batch fetched card ${name}:`, error);
          price_each = 0;
        }
      }
      // Fallback: Try individual fetch if batch didn't find it (shouldn't happen often)
      else {
        console.log(`[Shopping List] ⚠️ Card not in batch results, falling back to individual fetch for ${name}...`);
        
        try {
          const card = await fetchNamedCard(name);
          if (card) {
            const cheapest = await fetchCheapestPrint(card, currency);
            
            price_each = Math.max(0, Number(cheapest?.price || 0));
            set = cheapest?.set || card?.set;
            set_name = cheapest?.set_name || card?.set_name;
            collector_number = cheapest?.collector_number || card?.collector_number;
            oracle_text = cheapest?.oracle_text || card?.oracle_text || oracle_text;
            uri = cheapest?.uri || card?.uri || uri;
            prints = cheapest?.prints || 0;

            // Cache the prices we just fetched
            const prices = card?.prices || {};
            pricesToCache.push({
              name,
              usd: Number(prices.usd || 0) || undefined,
              eur: Number(prices.eur || 0) || undefined,
              gbp: undefined // Scryfall doesn't provide GBP
            });
          }
        } catch (error) {
          console.warn(`[Shopping List] Failed to fetch ${name}:`, error);
          price_each = 0;
        }
      }

      if (remainingBudget != null && price_each > remainingBudget) continue;

      const { role, tier } = roleHeuristic(name, oracle_text);

      items.push({
        name,
        set,
        set_name,
        collector_number,
        qty_want: qty,
        qty_have: have,
        qty_to_buy: to_buy,
        price_each,
        subtotal: +(price_each * to_buy).toFixed(2),
        currency,
        role,
        tier,
        risk: riskDot(prints),
        scryfall_uri: uri,
      });
    }

    // Cache newly fetched prices
    if (pricesToCache.length > 0) {
      await cachePrices(supabase, pricesToCache);
    }

    // sort: impact per £ (cheap+high qty prioritized) -> subtotal descending, then price_each asc
    items.sort((a, b) => (b.subtotal - a.subtotal) || (a.price_each - b.price_each));

    return NextResponse.json({ 
      ok: true, 
      snapshot_ts, 
      items,
      total: totalCount,
      offset: startIdx,
      hasMore: endIdx < totalCount
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "shopping list failed" }, { status: 500 });
  }
});

// Convenience GET wrapper so we can open Cost-to-Finish in a new tab
export const GET = withLogging(async (req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const deckId = String(url.searchParams.get('deckId')||'');
    const currency = normCur(url.searchParams.get('currency'));
    if (!deckId) return NextResponse.json({ ok:false, error:'missing deckId' }, { status:400 });
    // Reuse POST logic by forging a JSON body
    const fake = new Request(req.url, { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ deckId, currency }) }) as unknown as NextRequest;
    return POST(fake);
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 });
  }
});
