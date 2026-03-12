import { NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { getServerSupabase } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/price/debug
 * Returns diagnostics for Price Tracker: admin client, snapshot counts, sample lookups.
 * Open in browser or call from devtools to see why graph/movers might be empty.
 */
export async function GET() {
  const admin = getAdmin();
  const supabase = await getServerSupabase();
  const db = admin ?? supabase;

  const norm = (s: string) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['\u2019\u2018`]/g, "'")
      .replace(/\s+/g, " ")
      .trim();

  const out: Record<string, unknown> = {
    ok: true,
    env: {
      hasSupabaseUrl: !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
      hasServiceRoleKey: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE),
      usedAdmin: !!admin,
    },
    price_snapshots: {} as Record<string, unknown>,
    price_cache: {} as Record<string, unknown>,
    sampleLookups: {} as Record<string, unknown>,
  };

  try {
    // 1) Total count and date range (use limit to avoid timeout)
    const { count: totalCount, error: countError } = await db
      .from("price_snapshots")
      .select("*", { count: "exact", head: true });
    out.price_snapshots = {
      totalRows: totalCount ?? null,
      countError: countError?.message ?? null,
    };

    const { data: dateRange } = await db
      .from("price_snapshots")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1);
    const latestDate = (dateRange as any[])?.[0]?.snapshot_date ?? null;
    (out.price_snapshots as Record<string, unknown>).latestSnapshotDate = latestDate;

    // 2) Sample: do we have "sol ring" and "chatterfang, squirrel general" for USD?
    const testNames = ["sol ring", "chatterfang, squirrel general"];
    for (const name of testNames) {
      const { data: rows, error } = await db
        .from("price_snapshots")
        .select("name_norm, snapshot_date, unit, currency")
        .eq("name_norm", name)
        .eq("currency", "USD")
        .order("snapshot_date", { ascending: false })
        .limit(5);
      (out.sampleLookups as Record<string, unknown>)[name] = {
        rowCount: Array.isArray(rows) ? rows.length : 0,
        error: error?.message ?? null,
        sample: (rows as any[])?.slice(0, 2) ?? [],
      };
    }

    // 3) Raw sample of name_norm values (to see actual format in DB)
    const { data: rawSample } = await db
      .from("price_snapshots")
      .select("name_norm, snapshot_date, currency, unit")
      .eq("currency", "USD")
      .limit(5);
    (out.price_snapshots as Record<string, unknown>).rawSampleRows = rawSample ?? [];

    // 4) price_cache sample for same names
    const { data: pcRows } = await db
      .from("price_cache")
      .select("card_name, usd_price")
      .in("card_name", testNames);
    out.price_cache = { sampleRows: pcRows ?? [], rowCount: (pcRows as any[])?.length ?? 0 };

    // 5) Movers-style query: latest and prior dates, row count
    if (latestDate) {
      const latest = latestDate;
      const priorDate = new Date(new Date(latest).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data: bothDates, error: bothErr } = await db
        .from("price_snapshots")
        .select("name_norm, snapshot_date, unit")
        .eq("currency", "USD")
        .in("snapshot_date", [priorDate, latest])
        .limit(2000);
      (out.price_snapshots as Record<string, unknown>).moversQuery = {
        priorDate,
        latestDate: latest,
        rowCount: Array.isArray(bothDates) ? bothDates.length : 0,
        error: bothErr?.message ?? null,
      };
    }
  } catch (e: any) {
    out.error = e?.message ?? String(e);
  }

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
