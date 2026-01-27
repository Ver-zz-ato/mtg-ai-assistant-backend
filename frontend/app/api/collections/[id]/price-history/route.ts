import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: collectionId } = await params;
    const url = new URL(req.url);
    const currency = (url.searchParams.get("currency") || "USD").toUpperCase();
    const days = Math.min(60, Math.max(1, Number(url.searchParams.get("days") || 60)));

    if (!collectionId) {
      return NextResponse.json({ ok: false, error: "collectionId required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Get collection cards
    const { data: items, error: itemsErr } = await supabase
      .from("collection_cards")
      .select("name, qty")
      .eq("collection_id", collectionId);
    
    if (itemsErr) {
      return NextResponse.json({ ok: false, error: itemsErr.message }, { status: 500 });
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ ok: true, currency, points: [] });
    }

    // Normalize card names
    const cardNames = Array.from(new Set(items.map((i: any) => norm(i.name))));
    const cardQuantities = new Map<string, number>();
    for (const item of items) {
      const key = norm(item.name);
      cardQuantities.set(key, (cardQuantities.get(key) || 0) + (item.qty || 1));
    }

    // Calculate date range (last N days, but also ensure we get data from 30d and 60d ago if available)
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - days * 24 * 60 * 60 * 1000);
    const fromStr = fromDate.toISOString().slice(0, 10);
    
    // Also calculate 30d and 60d ago dates to ensure we include those if they exist
    const thirtyDaysAgo = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(toDate.getTime() - 60 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);
    const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().slice(0, 10);

    // Get all snapshots in date range for these cards
    // We fetch a wider range to ensure we get 30d/60d data even if it's slightly outside the requested days
    const extendedFromDate = new Date(Math.min(fromDate.getTime(), sixtyDaysAgo.getTime() - 7 * 24 * 60 * 60 * 1000)); // 7 days before 60d to catch nearby snapshots
    const extendedFromStr = extendedFromDate.toISOString().slice(0, 10);
    
    const { data: snapshots, error: snapshotsErr } = await supabase
      .from("price_snapshots")
      .select("name_norm, snapshot_date, unit")
      .in("name_norm", cardNames)
      .eq("currency", currency)
      .gte("snapshot_date", extendedFromStr)
      .order("snapshot_date", { ascending: true });

    if (snapshotsErr) {
      return NextResponse.json({ ok: false, error: snapshotsErr.message }, { status: 500 });
    }

    // Group by date and sum total value
    const byDate = new Map<string, number>();
    for (const row of (snapshots || []) as any[]) {
      const date = String(row.snapshot_date);
      const qty = cardQuantities.get(row.name_norm) || 0;
      const value = Number(row.unit) * qty;
      byDate.set(date, (byDate.get(date) || 0) + value);
    }

    // Ensure we have points for 30d and 60d ago (find closest if exact date doesn't exist)
    const findClosestSnapshot = (targetDate: Date): string | null => {
      let closest: string | null = null;
      let minDiff = Infinity;
      for (const date of byDate.keys()) {
        const dateObj = new Date(date);
        const diff = Math.abs(dateObj.getTime() - targetDate.getTime());
        // Accept snapshots within 7 days of target
        if (diff < minDiff && diff <= 7 * 24 * 60 * 60 * 1000) {
          minDiff = diff;
          closest = date;
        }
      }
      return closest;
    };

    // Add 30d and 60d points if they exist (within 7 days tolerance)
    const closest30d = findClosestSnapshot(thirtyDaysAgo);
    const closest60d = findClosestSnapshot(sixtyDaysAgo);
    
    // If we found close snapshots but they're not in our date range, ensure they're included
    if (closest30d && !byDate.has(closest30d)) {
      // Recalculate for this date
      const date30d = closest30d;
      let total30d = 0;
      for (const row of (snapshots || []) as any[]) {
        if (String(row.snapshot_date) === date30d) {
          const qty = cardQuantities.get(row.name_norm) || 0;
          total30d += Number(row.unit) * qty;
        }
      }
      if (total30d > 0) {
        byDate.set(date30d, total30d);
      }
    }
    
    if (closest60d && !byDate.has(closest60d)) {
      // Recalculate for this date
      const date60d = closest60d;
      let total60d = 0;
      for (const row of (snapshots || []) as any[]) {
        if (String(row.snapshot_date) === date60d) {
          const qty = cardQuantities.get(row.name_norm) || 0;
          total60d += Number(row.unit) * qty;
        }
      }
      if (total60d > 0) {
        byDate.set(date60d, total60d);
      }
    }

    // Convert to array of points and filter to requested date range
    const allPoints = Array.from(byDate.entries())
      .map(([date, total]) => ({ date, total: Number(total.toFixed(2)) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Filter to requested date range (last N days)
    const points = allPoints.filter(p => p.date >= fromStr);

    return NextResponse.json(
      { ok: true, currency, points },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
