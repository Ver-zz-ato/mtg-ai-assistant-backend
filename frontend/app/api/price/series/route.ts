import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import {
  normalizeScryfallCacheName,
  scryfallCacheLookupNameKeys,
} from "@/lib/server/scryfallCacheRow";

export const runtime = "nodejs";

/*
  GET /api/price/series?names[]=Sol%20Ring&names[]=Arcane%20Signet&currency=USD&from=2024-01-01
  Returns: {
    ok: true,
    currency: "USD",
    from: "2024-01-01",
    series: [{ name: "sol ring", points: [{ date: "2024-01-01", unit: 1.23 }, ...] }, ...]
  }
*/
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const admin = getAdmin();
    const db = admin ?? supabase;
    const url = new URL(req.url);
    const names = url.searchParams.getAll("names[]").filter(Boolean);
    const currency = (url.searchParams.get("currency") || "USD").toUpperCase();
    const from = url.searchParams.get("from") || "";

    if (!names.length) return NextResponse.json({ ok: true, currency, from, series: [] });

    // Log API usage for ops visibility (backend hit; mobile direct Supabase uses ops_price_series_direct_hit)
    const logClient = admin ?? supabase;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { logOpsEvent } = await import('@/lib/ops-events');
      await logOpsEvent(logClient, {
        event_type: 'ops_price_series_api_request',
        route: '/api/price/series',
        status: 'ok',
        user_id: user?.id ?? undefined,
        source: 'price_series',
        names_count: names.length,
        currency,
      });
    } catch {}

    // Primary `price_snapshots.name_norm` keys must match the snapshot writer (`normalizeScryfallCacheName`
    // in priceSnapshotFromScryfallBulk). Intentionally not `price_cache.card_name` normalization.
    // Up to 10 requested names; expand each with raw + cleanCardName keys like scryfall_cache lookups.
    const keySet = new Set<string>();
    for (const raw of names.slice(0, 10)) {
      for (const k of scryfallCacheLookupNameKeys(raw)) keySet.add(k);
    }
    const wanted = Array.from(keySet);

    let q = db
      .from("price_snapshots")
      .select("name_norm, snapshot_date, unit")
      .in("name_norm", wanted)
      .eq("currency", currency)
      .order("snapshot_date", { ascending: true });
    if (from) q = q.gte("snapshot_date", from);

    const { data, error } = await q;
    const debug = url.searchParams.get("debug") === "1";
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const byName = new Map<string, Array<{ snapshot_date: string; unit: number }>>();
    for (const row of (data || []) as any[]) {
      const n = String(row.name_norm);
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n)!.push({ snapshot_date: row.snapshot_date, unit: Number(row.unit) });
    }

    // Prefix fallback only when unambiguous: `firstWord%` must match rows for a single `name_norm`.
    // Multiple distinct cards under the same prefix → skip (better empty chart than wrong history).
    const stillMissingExact = wanted.filter((n) => !byName.has(n) || byName.get(n)!.length === 0);
    for (const n of stillMissingExact) {
      const firstWord = n.split(/[\s,，\uFF0C]/)[0];
      if (!firstWord || firstWord.length < 3) continue;
      let q2 = db
        .from("price_snapshots")
        .select("name_norm, snapshot_date, unit")
        .eq("currency", currency)
        .ilike("name_norm", `${firstWord}%`)
        .order("snapshot_date", { ascending: true });
      if (from) q2 = q2.gte("snapshot_date", from);
      const { data: ilikeRows } = await q2;
      const arr = (ilikeRows || []) as any[];
      if (arr.length === 0) continue;
      const distinctNorms = new Set(arr.map((r) => String(r.name_norm)));
      if (distinctNorms.size !== 1) continue;
      byName.set(n, arr.map((r) => ({ snapshot_date: r.snapshot_date, unit: Number(r.unit) })));
    }

    const today = new Date().toISOString().slice(0, 10);
    const stillMissing = wanted.filter((n) => !byName.has(n) || byName.get(n)!.length === 0);
    for (const n of stillMissing) {
      // 1) price_cache (card_name + usd_price)
      let pc: { usd_price?: number; eur_price?: number } | null = null;
      const variants = [n, n.replace(/'/g, "\u2019"), n.replace(/\u2019/g, "'")];
      for (const v of variants) {
        const { data } = await db.from("price_cache").select("usd_price, eur_price").eq("card_name", v).maybeSingle();
        if (data) { pc = data as any; break; }
      }
      if (pc) {
        const usdVal = Number(pc.usd_price) || 0;
        const eurVal = Number(pc.eur_price) || (usdVal ? usdVal * 0.92 : 0);
        const unit = currency === "USD" ? usdVal : currency === "EUR" ? eurVal : usdVal * 0.78;
        if (typeof unit === "number" && isFinite(unit) && unit > 0) {
          byName.set(n, [{ snapshot_date: today, unit }]);
        }
      }
    }
    // 2) Scryfall fallback for any still missing (same source as watchlist /api/price)
    const stillMissing2 = stillMissing.filter((n) => !byName.has(n) || byName.get(n)!.length === 0);
    if (stillMissing2.length > 0) {
      try {
        const res = await fetch("https://api.scryfall.com/cards/collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifiers: stillMissing2.map((name) => ({ name })) }),
          cache: "no-store",
        });
        if (res.ok) {
          const json = (await res.json()) as { data?: Array<{ name: string; prices?: { usd?: string; eur?: string } }> };
          const USD_EUR = 0.92;
          const USD_GBP = 0.78;
          for (const c of json.data ?? []) {
            const normName = normalizeScryfallCacheName(c.name);
            if (!byName.has(normName) || byName.get(normName)!.length === 0) {
              const usd = c.prices?.usd ? parseFloat(c.prices.usd) : 0;
              const eur = c.prices?.eur ? parseFloat(c.prices.eur) : usd * USD_EUR;
              const unit = currency === "USD" ? usd : currency === "EUR" ? eur : usd * USD_GBP;
              if (unit > 0) byName.set(normName, [{ snapshot_date: today, unit }]);
            }
          }
        }
      } catch {}
    }

    const series = Array.from(byName.entries()).map(([name, rows]) => ({
      name,
      points: rows.map(r => ({ date: r.snapshot_date, unit: r.unit })),
    }));

    const body: Record<string, unknown> = { ok: true, currency, from, series };
    if (debug) {
      body._debug = { usedAdmin: !!admin, wanted, seriesCount: series.length, byNameSize: byName.size };
    }
    return NextResponse.json(body, { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
