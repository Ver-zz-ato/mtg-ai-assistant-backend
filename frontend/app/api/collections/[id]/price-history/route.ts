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
    
    // Check if collection is public - if so, allow anonymous access
    const { data: meta } = await supabase
      .from("collection_meta")
      .select("is_public, visibility")
      .eq("collection_id", collectionId)
      .maybeSingle();
    
    const isPublic = meta && (meta.is_public === true || meta.visibility === 'public');
    
    // If not public, require authentication
    if (!isPublic) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
    }
    
    // Use service role client for public collections to bypass RLS
    let client = supabase;
    if (isPublic) {
      const { createClient: createServiceClient } = await import("@supabase/supabase-js");
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
      if (serviceKey) {
        client = createServiceClient(url, serviceKey, { auth: { persistSession: false } }) as any;
      }
    }

    // Get collection cards
    const { data: items, error: itemsErr } = await client
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
    const cardNames = Array.from(new Set(items.map((i: any) => norm(i.name)).filter(Boolean)));
    const cardQuantities = new Map<string, number>();
    for (const item of items) {
      const key = norm(item.name);
      if (key) {
        cardQuantities.set(key, (cardQuantities.get(key) || 0) + (item.qty || 1));
      }
    }

    if (cardNames.length === 0) {
      return NextResponse.json({ ok: true, currency, points: [] });
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

    // Get snapshots for these cards - limit to last 60 days (retention policy)
    // This matches the retention policy and avoids querying too much data
    const maxDaysBack = 60;
    const cutoffDate = new Date(toDate.getTime() - maxDaysBack * 24 * 60 * 60 * 1000);
    const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);
    
    console.log(`[PriceHistory] Querying snapshots for ${cardNames.length} cards (currency: ${currency}) from ${cutoffDateStr} onwards`);
    
    // Query with date filter first (uses index on snapshot_date), then filter by card names
    // This is more efficient than filtering by name first
    const { data: snapshots, error: snapshotsErr } = await client
      .from("price_snapshots")
      .select("name_norm, snapshot_date, unit")
      .eq("currency", currency)
      .gte("snapshot_date", cutoffDateStr) // Filter by date first (uses index)
      .in("name_norm", cardNames) // Then filter by card names
      .order("snapshot_date", { ascending: true })
      .limit(50000); // Safety limit

    if (snapshotsErr) {
      console.error(`[PriceHistory] Database error:`, snapshotsErr);
      console.error(`[PriceHistory] Query details: ${cardNames.length} card names, currency: ${currency}`);
      return NextResponse.json({ ok: false, error: `Database error: ${snapshotsErr.message}` }, { status: 500 });
    }

    // Debug: Log snapshot data availability
    const uniqueSnapshotDates = new Set((snapshots || []).map((s: any) => String(s.snapshot_date)));
    console.log(`[PriceHistory] Collection ${collectionId}: ${cardNames.length} cards, ${snapshots?.length || 0} snapshot rows, ${uniqueSnapshotDates.size} unique dates`);

    // Group by date and sum total value
    // For each date, sum up (price * quantity) for all cards that have a snapshot on that date
    const byDate = new Map<string, number>();
    for (const row of (snapshots || []) as any[]) {
      const date = String(row.snapshot_date);
      const cardName = String(row.name_norm);
      const qty = cardQuantities.get(cardName) || 0;
      const price = Number(row.unit) || 0;
      const value = price * qty;
      byDate.set(date, (byDate.get(date) || 0) + value);
    }
    
    // Log what dates we found
    const datesFound = Array.from(byDate.keys()).sort();
    console.log(`[PriceHistory] Dates with data: ${datesFound.length} dates (${datesFound.slice(0, 5).join(', ')}${datesFound.length > 5 ? '...' : ''})`);

    // Calculate 30d and 60d ago totals by finding closest snapshot for each card
    // This ensures we get accurate totals even if not all cards have snapshots on exact dates
    const calculateTotalForDate = (targetDate: Date, toleranceDays: number = 7): { total: number; date: string | null } => {
      let total = 0;
      const toleranceMs = toleranceDays * 24 * 60 * 60 * 1000;
      const foundDates = new Set<string>();
      
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
          foundDates.add(closestSnapshot.date);
        }
      }
      
      // Find the most common date among found snapshots (or closest to target)
      let bestDate: string | null = null;
      if (foundDates.size > 0) {
        // Use the date closest to target date
        let minDateDiff = Infinity;
        for (const dateStr of foundDates) {
          const dateObj = new Date(dateStr);
          const diff = Math.abs(dateObj.getTime() - targetDate.getTime());
          if (diff < minDateDiff) {
            minDateDiff = diff;
            bestDate = dateStr;
          }
        }
      }
      
      return { total, date: bestDate };
    };

    // Calculate 30d and 60d totals
    const result30d = calculateTotalForDate(thirtyDaysAgo, 7);
    const result60d = calculateTotalForDate(sixtyDaysAgo, 7);
    
    // Debug: Log 30d/60d calculation results
    console.log(`[PriceHistory] 30d calculation: total=${result30d.total}, date=${result30d.date}`);
    console.log(`[PriceHistory] 60d calculation: total=${result60d.total}, date=${result60d.date}`);
    
    // Add 30d and 60d points if we calculated totals for them (even if total is 0, we want to show the date)
    if (result30d.total > 0 && result30d.date) {
      byDate.set(result30d.date, result30d.total);
    }
    if (result60d.total > 0 && result60d.date) {
      byDate.set(result60d.date, result60d.total);
    }

    // Convert to array of points
    const allPoints = Array.from(byDate.entries())
      .map(([date, total]) => ({ date, total: Number(total.toFixed(2)) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Filter to requested date range (last N days), but ALWAYS include 30d and 60d points if they exist
    const points30d = result30d.date && result30d.total > 0 ? result30d.date : null;
    const points60d = result60d.date && result60d.total > 0 ? result60d.date : null;
    
    // Include all points within the requested range, plus 30d/60d markers if calculated
    const points = allPoints.filter(p => {
      // Always include points within the requested range
      if (p.date >= fromStr) return true;
      // Also include 30d and 60d points even if outside range (for graph display)
      if (points30d && p.date === points30d) return true;
      if (points60d && p.date === points60d) return true;
      return false;
    });
    
    console.log(`[PriceHistory] Final points: ${points.length} (from ${allPoints.length} total dates)`);

    return NextResponse.json(
      { ok: true, currency, points },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" } }
    );
  } catch (e: any) {
    console.error(`[PriceHistory] Unexpected error:`, e);
    console.error(`[PriceHistory] Stack:`, e?.stack);
    return NextResponse.json({ 
      ok: false, 
      error: e?.message || "server_error",
      details: process.env.NODE_ENV === 'development' ? String(e?.stack) : undefined
    }, { status: 500 });
  }
}
