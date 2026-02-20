import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

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
    const url = new URL(req.url);
    const names = url.searchParams.getAll("names[]").filter(Boolean);
    const currency = (url.searchParams.get("currency") || "USD").toUpperCase();
    const from = url.searchParams.get("from") || "";

    if (!names.length) return NextResponse.json({ ok: true, currency, from, series: [] });

    // Normalize names (server side) - match price_cache card_name format (apostrophes, diacritics)
    const norm = (s: string) => String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/['\u2019\u2018`]/g,"'").replace(/\s+/g," ").trim();
    const wanted = Array.from(new Set(names.map(norm))).slice(0, 10); // cap to 10 series for MVP

    let q = supabase
      .from("price_snapshots")
      .select("name_norm, snapshot_date, unit")
      .in("name_norm", wanted)
      .eq("currency", currency)
      .order("snapshot_date", { ascending: true });
    if (from) q = q.gte("snapshot_date", from);

    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const byName = new Map<string, Array<{ snapshot_date: string; unit: number }>>();
    for (const row of (data || []) as any[]) {
      const n = String(row.name_norm);
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n)!.push({ snapshot_date: row.snapshot_date, unit: Number(row.unit) });
    }

    // Fallback: when no price_snapshots data, use price_cache then Scryfall for today's price
    const today = new Date().toISOString().slice(0, 10);
    const stillMissing = wanted.filter((n) => !byName.has(n) || byName.get(n)!.length === 0);
    for (const n of stillMissing) {
      // 1) price_cache (card_name + usd_price)
      let pc: { usd_price?: number; eur_price?: number } | null = null;
      const variants = [n, n.replace(/'/g, "\u2019"), n.replace(/\u2019/g, "'")];
      for (const v of variants) {
        const { data } = await supabase.from("price_cache").select("usd_price, eur_price").eq("card_name", v).maybeSingle();
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
            const normName = norm(c.name);
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

    return NextResponse.json({ ok: true, currency, from, series }, { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
