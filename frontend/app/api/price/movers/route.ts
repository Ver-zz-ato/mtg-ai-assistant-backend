import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { GUEST_DAILY_FEATURE_LIMIT, PRICE_TRACKER_FREE, PRICE_TRACKER_PRO } from "@/lib/feature-limits";

export const runtime = "nodejs";

const TRACKER_ROUTE = "/api/price/tracker";

/*
  GET /api/price/movers?currency=USD&window_days=7&limit=50
  Returns cards with largest absolute pct change.
  Works for guests (IP rate limit) and logged-in users. Rate limited with deck-series via TRACKER_ROUTE.
*/
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
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
      dailyCap = isPro ? PRICE_TRACKER_PRO : PRICE_TRACKER_FREE;
      rateLimitKey = `user:${await hashString(user.id)}`;
    } else {
      dailyCap = GUEST_DAILY_FEATURE_LIMIT;
      rateLimitKey = `ip:${await hashString(ip)}`;
    }

    const rateLimit = await checkDurableRateLimit(supabase, rateLimitKey, TRACKER_ROUTE, dailyCap, 1);
    const skipLimitInDev = process.env.NODE_ENV === "development" && process.env.SKIP_PRICE_RATE_LIMIT === "1";
    if (!skipLimitInDev && !rateLimit.allowed) {
      return NextResponse.json({
        ok: false,
        code: "RATE_LIMIT_DAILY",
        proUpsell: !user,
        error: user
          ? (isPro ? "You've reached your daily limit. Contact support if you need higher limits." : `You've used your ${PRICE_TRACKER_FREE} free Price Tracker runs today. Upgrade to Pro for more!`)
          : "Daily limit reached. Sign in for more.",
        resetAt: rateLimit.resetAt,
      }, { status: 429 });
    }

    const url = new URL(req.url);
    const currency = (url.searchParams.get("currency") || "USD").toUpperCase();
    const windowDays = Math.max(1, Math.min(90, parseInt(url.searchParams.get("window_days") || "7", 10)));
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "50", 10)));

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
    const latest = (latestRows as any[])?.[0]?.snapshot_date || null;
    if (process.env.NODE_ENV === "development") {
      console.log("[price/movers]", { usedAdmin: !!admin, currency, latest, latestError: latestError?.message });
    }
    if (!latest) {
      const empty: Record<string, unknown> = { ok: true, rows: [], latest: null };
      if (debug) empty._debug = { usedAdmin: !!admin, latestError: latestError?.message, message: "No latest snapshot date" };
      return NextResponse.json(empty);
    }

    const cutoff = new Date(new Date(latest).getTime() - windowDays*24*60*60*1000).toISOString().slice(0,10);

    // Pick the most recent snapshot before latest and within the window; fallback to any prior date (up to 90d) if none in window
    let { data: priorRows } = await db
      .from('price_snapshots')
      .select('snapshot_date')
      .eq('currency', currency)
      .lt('snapshot_date', latest)
      .gte('snapshot_date', cutoff)
      .order('snapshot_date', { ascending: false })
      .limit(1);
    let prior = (priorRows as any[])?.[0]?.snapshot_date || null;
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
      prior = (fallbackRows as any[])?.[0]?.snapshot_date || null;
    }
    if (!prior) return NextResponse.json({ ok: true, rows: [], latest });

    // Pull both dates
    const { data } = await db
      .from('price_snapshots')
      .select('name_norm, snapshot_date, unit')
      .eq('currency', currency)
      .in('snapshot_date', [prior, latest]);
    const rows = Array.isArray(data) ? (data as any[]) : [];

    const byName: Record<string, { prior?: number; latest?: number }> = {};
    for (const r of rows) {
      const k = String((r as any).name_norm);
      if (!byName[k]) byName[k] = {} as any;
      if ((r as any).snapshot_date === prior) byName[k].prior = Number((r as any).unit);
      if ((r as any).snapshot_date === latest) byName[k].latest = Number((r as any).unit);
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
    return NextResponse.json(body);
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
