import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * WHAT IS A PRICE SNAPSHOT?
 * 
 * A "price snapshot" is a daily record of card prices stored in the database.
 * Think of it like taking a photo of all card prices each day.
 * 
 * Each snapshot contains:
 * - snapshot_date: The date (e.g., "2026-01-27")
 * - name_norm: The card name (normalized)
 * - currency: USD, EUR, or GBP
 * - unit: The price per card
 * 
 * HOW IT WORKS:
 * - Daily automated jobs fetch prices from Scryfall
 * - Prices are stored in the price_snapshots table
 * - System retains 60 days of data (older is auto-deleted)
 * 
 * WHY YOU MIGHT ONLY SEE 1 DATA POINT:
 * - If snapshots only started recently, there's only 1 day of data
 * - You need 30+ days of snapshots to see 30d/60d history
 * - Each day a new snapshot is created, you'll get more history points
 */

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get all unique snapshot dates
    const { data: allSnapshots, error } = await supabase
      .from('price_snapshots')
      .select('snapshot_date, currency')
      .order('snapshot_date', { ascending: false })
      .limit(10000); // Limit to avoid timeout

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Process to get unique dates
    const uniqueDates = new Set<string>();
    const datesByCurrency = new Map<string, Set<string>>();
    
    (allSnapshots || []).forEach((row: any) => {
      const date = String(row.snapshot_date);
      const currency = String(row.currency || 'USD').toUpperCase();
      uniqueDates.add(date);
      
      if (!datesByCurrency.has(currency)) {
        datesByCurrency.set(currency, new Set());
      }
      datesByCurrency.get(currency)!.add(date);
    });

    const dateArray = Array.from(uniqueDates).sort();
    const oldestDate = dateArray[0] || null;
    const newestDate = dateArray[dateArray.length - 1] || null;
    
    const daysOfData = dateArray.length;
    const daysAgo = newestDate 
      ? Math.floor((new Date().getTime() - new Date(newestDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Calculate 30d and 60d ago dates
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    
    // Check if we have snapshots near 30d/60d ago
    const has30dData = dateArray.some(date => {
      const dateObj = new Date(date);
      const diff = Math.abs(dateObj.getTime() - thirtyDaysAgo.getTime());
      return diff <= 7 * 24 * 60 * 60 * 1000; // Within 7 days
    });
    
    const has60dData = dateArray.some(date => {
      const dateObj = new Date(date);
      const diff = Math.abs(dateObj.getTime() - sixtyDaysAgo.getTime());
      return diff <= 7 * 24 * 60 * 60 * 1000; // Within 7 days
    });

    return NextResponse.json({
      ok: true,
      summary: {
        totalSnapshotDates: daysOfData,
        oldestDate,
        newestDate,
        daysAgo: daysAgo !== null ? `${daysAgo} days ago` : 'unknown',
        dateRange: oldestDate && newestDate 
          ? `${oldestDate} to ${newestDate} (${daysOfData} unique dates)`
          : 'No snapshots found',
        has30dData,
        has60dData,
        canShowHistory: daysOfData >= 2, // Need at least 2 points for a graph
        canShow30d60d: has30dData && has60dData,
        currencies: Object.fromEntries(
          Array.from(datesByCurrency.entries()).map(([curr, dates]) => [curr, dates.size])
        )
      },
      recentDates: dateArray.slice(-10).reverse(), // Last 10 dates
      explanation: {
        whatIsSnapshot: "A price snapshot is a daily record of card prices. Each day, prices are captured and stored.",
        whyOnlyOnePoint: daysOfData === 1 
          ? "You only have 1 snapshot date, which means snapshots just started. You need 30+ days of snapshots to see 30d/60d history."
          : `You have ${daysOfData} days of snapshot data. ${has30dData && has60dData ? '30d/60d data should be available.' : 'Need more days for 30d/60d history.'}`,
        howToGetMore: "Snapshots are created automatically by daily cron jobs. Each day a new snapshot is added, you'll get more history points."
      }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
