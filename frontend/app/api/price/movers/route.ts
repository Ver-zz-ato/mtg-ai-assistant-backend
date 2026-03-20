import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { GUEST_DAILY_FEATURE_LIMIT, PRICE_TRACKER_MOVERS_FREE, PRICE_TRACKER_MOVERS_PRO } from "@/lib/feature-limits";

export const runtime = "nodejs";

const MOVERS_ROUTE = "/api/price/movers";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

type MoversCacheEntry = { body: Record<string, unknown>; at: number };
const moversResponseCache = new Map<string, MoversCacheEntry>();

/*
  GET /api/price/movers?currency=USD&window_days=7&limit=50
  Returns cards with largest absolute pct change.
  Works for guests (IP rate limit) and logged-in users. Uses separate rate-limit bucket from deck-series.
*/
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const currency = (url.searchParams.get("currency") || "USD").toUpperCase();
    const windowDays = Math.max(1, Math.min(90, parseInt(url.searchParams.get("window_days") || "7", 10)));
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "50", 10)));
    const cacheKey = `movers:${currency}:${windowDays}:${limit}`;

    const cached = moversResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      if (process.env.OPS_LOG_CACHE_EVENTS === '1') {
        try {
          const supabase = await getServerSupabase();
          const { logOpsEvent } = await import('@/lib/ops-events');
          await logOpsEvent(supabase, {
            event_type: 'ops_movers_cache_hit',
            route: MOVERS_ROUTE,
            status: 'ok',
          });
        } catch {}
      }
      return NextResponse.json(cached.body, {
        headers: { "X-ManaTap-Movers-Cache": "HIT", "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" },
      });
    }

    let supabase = await getServerSupabase();
    let { data: { user } } = await supabase.auth.getUser();

    // Auth precedence:
    // 1) cookie user (website)
    // 2) else Authorization: Bearer <token> (mobile app)
    // 3) else guest/IP-based behavior (existing)
    if (!user) {
      const authHeader = req.headers.get('Authorization');
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import('@/lib/server-supabase');
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser(bearerToken);
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }

    type SnapshotDateRow = { snapshot_date: string };
    type NameUnitRow = { name_norm: string; unit: number };

    const { checkDurableRateLimit } = await import("@/lib/api/durable-rate-limit");
    const { hashString } = await import("@/lib/guest-tracking");
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = (forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip")) || "unknown";

    let dailyCap: number;
    let rateLimitKey: string;
    let isPro = false;

    if (user) {
      const { checkProStatus } = await import("@/lib/server-pro-check");
      isPro = await checkProStatus(user.id);
      dailyCap = isPro ? PRICE_TRACKER_MOVERS_PRO : PRICE_TRACKER_MOVERS_FREE;
      rateLimitKey = `user:${await hashString(user.id)}`;
    } else {
      dailyCap = GUEST_DAILY_FEATURE_LIMIT;
      rateLimitKey = `ip:${await hashString(ip)}`;
    }

    const rateLimit = await checkDurableRateLimit(supabase, rateLimitKey, MOVERS_ROUTE, dailyCap, 1);
    const skipLimitInDev = process.env.NODE_ENV === "development" && process.env.SKIP_PRICE_RATE_LIMIT === "1";
    if (!skipLimitInDev && !rateLimit.allowed) {
      return NextResponse.json({
        ok: false,
        code: "RATE_LIMIT_DAILY",
        proUpsell: !user,
        error: user
          ? (isPro ? "You've reached your daily limit. Contact support if you need higher limits." : `You've used your ${PRICE_TRACKER_MOVERS_FREE} free Price Tracker runs today. Upgrade to Pro for more!`)
          : "Daily limit reached. Sign in for more.",
        resetAt: rateLimit.resetAt,
      }, { status: 429 });
    }

    // Use admin client so we can read price_snapshots (RLS may block anon/authenticated)
    const admin = (await import("@/app/api/_lib/supa")).getAdmin();
    const db = admin ?? supabase;

    const debug = url.searchParams.get("debug") === "1";

    // Find latest snapshot date for this currency
    const { data: latestRows, error: latestError } = await db
      .from('price_snapshots')
      .select('snapshot_date')
      .eq('currency', currency)
      .order('snapshot_date', { ascending: false })
      .limit(1);
    const latest = ((latestRows as unknown as SnapshotDateRow[] | null)?.[0]?.snapshot_date) ?? null;
    if (!latest) {
      const empty: Record<string, unknown> = { ok: true, rows: [], latest: null };
      if (debug) empty._debug = { usedAdmin: !!admin, latestError: latestError?.message, message: "No latest snapshot date" };
      return NextResponse.json(empty);
    }

    const cutoff = new Date(new Date(latest).getTime() - windowDays*24*60*60*1000).toISOString().slice(0,10);

    // Pick the most recent snapshot before latest and within the window; fallback to any prior date (up to 90d) if none in window
    const { data: priorRows } = await db
      .from('price_snapshots')
      .select('snapshot_date')
      .eq('currency', currency)
      .lt('snapshot_date', latest)
      .gte('snapshot_date', cutoff)
      .order('snapshot_date', { ascending: false })
      .limit(1);
    let prior = ((priorRows as unknown as SnapshotDateRow[] | null)?.[0]?.snapshot_date) ?? null;
    if (!prior) {
      const fallbackCutoff = new Date(new Date(latest).getTime() - 90*24*60*60*1000).toISOString().slice(0,10);
      const { data: fallbackRows } = await db
        .from('price_snapshots')
        .select('snapshot_date')
        .eq('currency', currency)
        .lt('snapshot_date', latest)
        .gte('snapshot_date', fallbackCutoff)
        .order('snapshot_date', { ascending: false })
        .limit(1);
      prior = ((fallbackRows as unknown as SnapshotDateRow[] | null)?.[0]?.snapshot_date) ?? null;
    }
    if (!prior) return NextResponse.json({ ok: true, rows: [], latest });

    // Pull prior and latest in separate queries (avoids 1000-row cap giving no overlap)
    const { data: priorData } = await db
      .from('price_snapshots')
      .select('name_norm, unit')
      .eq('currency', currency)
      .eq('snapshot_date', prior)
      .limit(10000);
    const { data: latestData } = await db
      .from('price_snapshots')
      .select('name_norm, unit')
      .eq('currency', currency)
      .eq('snapshot_date', latest)
      .limit(10000);
    const priorMap = new Map<string, number>();
    for (const r of (priorData ?? []) as unknown as NameUnitRow[]) {
      priorMap.set(String(r.name_norm), Number(r.unit));
    }
    const rows: { name_norm: string; snapshot_date: string; unit: number }[] = [];
    for (const r of (latestData ?? []) as unknown as NameUnitRow[]) {
      const n = r.name_norm ? String(r.name_norm) : '';
      if (priorMap.has(n)) {
        rows.push({ name_norm: n, snapshot_date: prior, unit: priorMap.get(n)! });
        rows.push({ name_norm: n, snapshot_date: latest, unit: Number(r.unit) });
      }
    }
    const byName: Record<string, { prior?: number; latest?: number }> = {};
    for (const r of rows) {
      const k = String(r.name_norm);
      if (!byName[k]) byName[k] = {};
      if (r.snapshot_date === prior) byName[k].prior = Number(r.unit);
      if (r.snapshot_date === latest) byName[k].latest = Number(r.unit);
    }

    const out = Object.entries(byName)
      .filter(([, v]) => typeof v.prior === 'number' && typeof v.latest === 'number' && Number(v.prior) > 0)
      .map(([name, v]) => {
        const priorV = Number(v.prior);
        const latestV = Number(v.latest);
        const delta = latestV - priorV;
        const pct = delta / priorV;
        return { name, prior: priorV, latest: latestV, delta, pct };
      })
      .sort((a,b) => Math.abs(b.pct) - Math.abs(a.pct))
      .slice(0, limit);

    const body: Record<string, unknown> = { ok: true, latest, prior, rows: out };
    if (debug) {
      body._debug = { usedAdmin: !!admin, rawRowCount: rows.length, byNameKeys: Object.keys(byName).length, prior, latest };
    }
    moversResponseCache.set(cacheKey, { body, at: Date.now() });
    if (process.env.OPS_LOG_CACHE_EVENTS === '1') {
      try {
        const { logOpsEvent } = await import('@/lib/ops-events');
        await logOpsEvent(db, { event_type: 'ops_movers_cache_miss', route: MOVERS_ROUTE, status: 'ok' });
      } catch {}
    }
    return NextResponse.json(body, {
      headers: { "X-ManaTap-Movers-Cache": "MISS", "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg || 'server_error' }, { status: 500 });
  }
}
