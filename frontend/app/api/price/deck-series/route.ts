import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { PRICE_TRACKER_DECK_SERIES_FREE, PRICE_TRACKER_DECK_SERIES_PRO } from "@/lib/feature-limits";

export const runtime = "nodejs";

const DECK_SERIES_ROUTE = "/api/price/deck-series";
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 min

type DeckSeriesCacheEntry = { body: Record<string, unknown>; at: number };
const deckSeriesResponseCache = new Map<string, DeckSeriesCacheEntry>();

/*
  GET /api/price/deck-series?deck_id=...&currency=USD&from=YYYY-MM-DD
  Returns: { ok: true, currency, from, points: [{ date, total }] }
  Uses separate rate-limit bucket from movers. Response cached 3 min.
*/
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const deckId = url.searchParams.get("deck_id") || "";
    const currency = (url.searchParams.get("currency") || "USD").toUpperCase();
    const from = url.searchParams.get("from") || "";
    const cacheKey = deckId ? `deck-series:${deckId}:${currency}:${from}` : "";

    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (cacheKey) {
      const cached = deckSeriesResponseCache.get(cacheKey);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return NextResponse.json(cached.body, {
          headers: { "X-ManaTap-DeckSeries-Cache": "HIT", "Cache-Control": "private, s-maxage=180" },
        });
      }
    }

    const { checkProStatus } = await import("@/lib/server-pro-check");
    const isPro = await checkProStatus(user.id);
    const dailyCap = isPro ? PRICE_TRACKER_DECK_SERIES_PRO : PRICE_TRACKER_DECK_SERIES_FREE;
    const { checkDurableRateLimit } = await import("@/lib/api/durable-rate-limit");
    const { hashString } = await import("@/lib/guest-tracking");
    const userKeyHash = `user:${await hashString(user.id)}`;
    const rateLimit = await checkDurableRateLimit(supabase, userKeyHash, DECK_SERIES_ROUTE, dailyCap, 1);
    const skipLimitInDev = process.env.NODE_ENV === "development" && process.env.SKIP_PRICE_RATE_LIMIT === "1";
    if (!skipLimitInDev && !rateLimit.allowed) {
      return NextResponse.json({
        ok: false,
        code: "RATE_LIMIT_DAILY",
        proUpsell: !isPro,
        error: isPro
          ? "You've reached your daily limit. Contact support if you need higher limits."
          : `You've used your ${PRICE_TRACKER_DECK_SERIES_FREE} free Price Tracker runs today. Upgrade to Pro for more!`,
        resetAt: rateLimit.resetAt,
      }, { status: 429 });
    }

    if (!deckId) return NextResponse.json({ ok: true, currency, from, points: [] });

    // Get deck cards
    const { data: cards } = await supabase
      .from('deck_cards')
      .select('name, qty')
      .eq('deck_id', deckId)
      .limit(400);
    const arr = Array.isArray(cards) ? (cards as any[]).map(x=>({ name:String(x.name), qty:Number(x.qty||1) })) : [];
    if (!arr.length) return NextResponse.json({ ok:true, currency, from, points: [] });

    const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
    const nameSet = Array.from(new Set(arr.map(a=>norm(a.name))));

    // Pull all snapshots for these names and currency (since 'from' if provided)
    let q = supabase
      .from('price_snapshots')
      .select('name_norm, snapshot_date, unit')
      .eq('currency', currency)
      .in('name_norm', nameSet)
      .order('snapshot_date', { ascending: true });
    if (from) q = q.gte('snapshot_date', from);

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });

    // qty map
    const qtyMap = new Map<string, number>();
    for (const { name, qty } of arr) qtyMap.set(norm(name), (qtyMap.get(norm(name))||0) + Number(qty||1));

    // Aggregate total per date
    const byDate = new Map<string, number>();
    for (const row of (data||[]) as any[]) {
      const n = String(row.name_norm);
      const d = String(row.snapshot_date);
      const unit = Number(row.unit)||0;
      const qn = qtyMap.get(n)||0;
      byDate.set(d, (byDate.get(d)||0) + unit*qn);
    }
    const points = Array.from(byDate.entries()).map(([date, total]) => ({ date, total: Number(total.toFixed(2)) })).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const body = { ok: true, currency, from, points };
    if (cacheKey) deckSeriesResponseCache.set(cacheKey, { body, at: Date.now() });
    return NextResponse.json(body, {
      headers: { "X-ManaTap-DeckSeries-Cache": "MISS", "Cache-Control": "private, s-maxage=180" },
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}
