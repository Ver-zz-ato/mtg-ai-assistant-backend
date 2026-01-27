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

    // Calculate 30d and 60d ago totals by finding closest snapshot for each card
    // This ensures we get accurate totals even if not all cards have snapshots on exact dates
    const calculateTotalForDate = (targetDate: Date, toleranceDays: number = 7): number => {
      let total = 0;
      const toleranceMs = toleranceDays * 24 * 60 * 60 * 1000;
      
      // For each card in collection, find its price on or near target date
      for (const [cardName, qty] of cardQuantities.entries()) {
        // Find closest snapshot for this card within tolerance
        let closestSnapshot: { date: string; price: number } | null = null;
        let minDiff = Infinity;
        
        for (const row of (snapshots || []) as any[]) {
          if (row.name_norm === cardName) {
            const snapshotDate = new Date(String(row.snapshot_date));
            const diff = Math.abs(snapshotDate.getTime() - targetDate.getTime());
            if (diff < minDiff && diff <= toleranceMs) {
              minDiff = diff;
              closestSnapshot = {
                date: String(row.snapshot_date),
                price: Number(row.unit) || 0
              };
            }
          }
        }
        
        if (closestSnapshot) {
          total += closestSnapshot.price * qty;
        }
      }
      
      return total;
    };

    // Calculate 30d and 60d totals
    const total30d = calculateTotalForDate(thirtyDaysAgo, 7);
    const total60d = calculateTotalForDate(sixtyDaysAgo, 7);
    
    // Find closest snapshot dates to 30d/60d for display
    const findClosestSnapshotDate = (targetDate: Date): string | null => {
      const allDates = Array.from(new Set((snapshots || []).map((r: any) => String(r.snapshot_date))));
      let closest: string | null = null;
      let minDiff = Infinity;
      const toleranceMs = 7 * 24 * 60 * 60 * 1000;
      
      for (const dateStr of allDates) {
        const dateObj = new Date(dateStr);
        const diff = Math.abs(dateObj.getTime() - targetDate.getTime());
        if (diff < minDiff && diff <= toleranceMs) {
          minDiff = diff;
          closest = dateStr;
        }
      }
      return closest;
    };

    const closest30dDate = findClosestSnapshotDate(thirtyDaysAgo);
    const closest60dDate = findClosestSnapshotDate(sixtyDaysAgo);
    
    // Add 30d and 60d points if we calculated totals for them
    if (total30d > 0 && closest30dDate) {
      byDate.set(closest30dDate, total30d);
    }
    if (total60d > 0 && closest60dDate) {
      byDate.set(closest60dDate, total60d);
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
