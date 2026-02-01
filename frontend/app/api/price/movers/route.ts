import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { PRICE_TRACKER_FREE, PRICE_TRACKER_PRO } from "@/lib/feature-limits";

export const runtime = "nodejs";

const TRACKER_ROUTE = "/api/price/tracker";

/*
  GET /api/price/movers?currency=USD&window_days=7&limit=50
  Returns cards with largest absolute pct change.
  Rate limited with deck-series via TRACKER_ROUTE.
*/
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const { checkProStatus } = await import("@/lib/server-pro-check");
    const isPro = await checkProStatus(user.id);
    const dailyCap = isPro ? PRICE_TRACKER_PRO : PRICE_TRACKER_FREE;
    const { checkDurableRateLimit } = await import("@/lib/api/durable-rate-limit");
    const { hashString } = await import("@/lib/guest-tracking");
    const userKeyHash = `user:${await hashString(user.id)}`;
    const rateLimit = await checkDurableRateLimit(supabase, userKeyHash, TRACKER_ROUTE, dailyCap, 1);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        ok: false,
        code: "RATE_LIMIT_DAILY",
        proUpsell: !isPro,
        error: isPro
          ? "You've reached your daily limit. Contact support if you need higher limits."
          : `You've used your ${PRICE_TRACKER_FREE} free Price Tracker runs today. Upgrade to Pro for more!`,
        resetAt: rateLimit.resetAt,
      }, { status: 429 });
    }

    const url = new URL(req.url);
    const currency = (url.searchParams.get("currency") || "USD").toUpperCase();
    const windowDays = Math.max(1, Math.min(90, parseInt(url.searchParams.get("window_days") || "7", 10)));
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "50", 10)));

    // Find latest snapshot date for this currency
    const { data: latestRows } = await supabase
      .from('price_snapshots')
      .select('snapshot_date')
      .eq('currency', currency)
      .order('snapshot_date', { ascending: false })
      .limit(1);
    const latest = (latestRows as any[])?.[0]?.snapshot_date || null;
    if (!latest) return NextResponse.json({ ok: true, rows: [], latest: null });

    const cutoff = new Date(new Date(latest).getTime() - windowDays*24*60*60*1000).toISOString().slice(0,10);

    // Pick the earliest snapshot >= cutoff (closest to cutoff that exists)
    const { data: priorRows } = await supabase
      .from('price_snapshots')
      .select('snapshot_date')
      .eq('currency', currency)
      .gte('snapshot_date', cutoff)
      .order('snapshot_date', { ascending: true })
      .limit(1);
    const prior = (priorRows as any[])?.[0]?.snapshot_date || null;
    if (!prior || prior === latest) return NextResponse.json({ ok: true, rows: [], latest });

    // Pull both dates
    const { data } = await supabase
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

    return NextResponse.json({ ok: true, latest, prior, rows: out });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
