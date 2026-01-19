import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CachePresets } from "@/lib/api/cache";

/**
 * Price Cache Depth Documentation:
 * 
 * The price_snapshots table stores historical price data with the following characteristics:
 * - Retention Policy: 60 days (data older than 60 days is automatically deleted)
 * - Snapshot Frequency: Daily snapshots are created via bulk import jobs
 * - Currency Support: USD, EUR, GBP (GBP is converted from USD using exchange rates)
 * 
 * Historical Data Availability:
 * - Maximum depth: 60 days (due to retention policy)
 * - Minimum depth: Depends on when snapshots started (typically available from first snapshot date)
 * - Missing data: The API gracefully handles missing historical data by finding the closest available snapshot
 * 
 * Usage:
 * - This endpoint returns the most recent snapshot for requested cards
 * - For historical data, use /api/price/series with a "from" parameter
 * - For price deltas (24h, 7d, 30d), use /api/price which finds closest snapshots to target dates
 */

function norm(name: string): string {
  return String(name||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json().catch(()=>({}));
    const names: string[] = Array.isArray(body?.names) ? body.names.filter(Boolean) : [];
    const currency: string = String(body?.currency || 'USD').toUpperCase();
    if (!names.length) return NextResponse.json({ ok: true, prices: {}, currency, snapshot_date: null });

    const keys = Array.from(new Set(names.map(norm)));

    // Find the most recent snapshot date available for this currency
    let latest: string | null = null;
    try {
      const { data } = await supabase
        .from('price_snapshots')
        .select('snapshot_date')
        .eq('currency', currency)
        .order('snapshot_date', { ascending: false })
        .limit(1);
      latest = (data as any[])?.[0]?.snapshot_date || null;
    } catch {}

    if (!latest) return NextResponse.json({ ok: true, prices: {}, currency, snapshot_date: null });

    // Fetch prices for that date
    const { data, error } = await supabase
      .from('price_snapshots')
      .select('name_norm, unit')
      .eq('currency', currency)
      .eq('snapshot_date', latest)
      .in('name_norm', keys);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const prices: Record<string, number> = {};
    for (const row of (data as any[]) || []) prices[row.name_norm] = Number(row.unit);

    return NextResponse.json(
      { ok: true, prices, currency, snapshot_date: latest },
      { headers: CachePresets.VERY_LONG }
    );
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}