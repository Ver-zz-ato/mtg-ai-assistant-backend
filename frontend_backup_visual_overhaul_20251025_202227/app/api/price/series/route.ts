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

    // Normalize names (server side) to align with price_snapshots.name_norm
    const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
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
    const series = Array.from(byName.entries()).map(([name, rows]) => ({
      name,
      points: rows.map(r => ({ date: r.snapshot_date, unit: r.unit })),
    }));

    return NextResponse.json({ ok: true, currency, from, series }, { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
