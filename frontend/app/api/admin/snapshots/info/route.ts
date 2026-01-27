import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * What is a "Price Snapshot"?
 * 
 * A price snapshot is a daily record of card prices stored in the `price_snapshots` table.
 * Each snapshot contains:
 * - snapshot_date: The date the snapshot was taken (YYYY-MM-DD)
 * - name_norm: Normalized card name
 * - currency: USD, EUR, or GBP
 * - unit: The price per card in that currency
 * 
 * Snapshots are created daily via automated jobs that fetch prices from Scryfall.
 * The system retains 60 days of historical snapshots (older data is automatically deleted).
 * 
 * This allows us to:
 * - Show price history graphs (30d, 60d ago)
 * - Calculate price changes over time
 * - Provide historical pricing data for collections and decks
 */

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Get snapshot statistics
    const { data: dateRange, error: dateError } = await supabase
      .from('price_snapshots')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1);

    const { data: oldestDate, error: oldestError } = await supabase
      .from('price_snapshots')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: true })
      .limit(1);

    // Get unique snapshot dates (how many days of data we have)
    const { data: uniqueDates, error: datesError } = await supabase
      .from('price_snapshots')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false });

    // Get counts by currency
    const { data: currencyCounts, error: currencyError } = await supabase
      .from('price_snapshots')
      .select('currency, snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(10000); // Limit to avoid timeout

    // Process the data
    const uniqueDatesSet = new Set<string>();
    const datesByCurrency = new Map<string, Set<string>>();
    let totalRows = 0;

    if (uniqueDates) {
      uniqueDates.forEach((row: any) => {
        const date = String(row.snapshot_date);
        uniqueDatesSet.add(date);
      });
    }

    if (currencyCounts) {
      currencyCounts.forEach((row: any) => {
        totalRows++;
        const currency = String(row.currency || 'USD').toUpperCase();
        const date = String(row.snapshot_date);
        if (!datesByCurrency.has(currency)) {
          datesByCurrency.set(currency, new Set());
        }
        datesByCurrency.get(currency)!.add(date);
      });
    }

    const newestDate = dateRange && dateRange[0] ? String(dateRange[0].snapshot_date) : null;
    const oldestDateStr = oldestDate && oldestDate[0] ? String(oldestDate[0].snapshot_date) : null;
    
    const daysOfData = newestDate && oldestDateStr 
      ? Math.ceil((new Date(newestDate).getTime() - new Date(oldestDateStr).getTime()) / (1000 * 60 * 60 * 24)) + 1
      : uniqueDatesSet.size;

    const currencyBreakdown: Record<string, { dates: number; sampleDate?: string }> = {};
    for (const [currency, dates] of datesByCurrency.entries()) {
      const dateArray = Array.from(dates).sort().reverse();
      currencyBreakdown[currency] = {
        dates: dates.size,
        sampleDate: dateArray[0] || undefined
      };
    }

    return NextResponse.json({
      ok: true,
      summary: {
        totalRows: totalRows > 0 ? totalRows : 'unknown (query limited to 10k rows)',
        uniqueSnapshotDates: uniqueDatesSet.size,
        daysOfData,
        oldestDate: oldestDateStr,
        newestDate,
        dateRange: oldestDateStr && newestDate 
          ? `${oldestDateStr} to ${newestDate}`
          : 'No data',
        currencies: Object.keys(currencyBreakdown),
        currencyBreakdown
      },
      explanation: {
        whatIsSnapshot: "A price snapshot is a daily record of card prices. Each day, the system takes a 'snapshot' of prices from Scryfall and stores them in the price_snapshots table.",
        retentionPolicy: "The system retains 60 days of historical snapshots. Data older than 60 days is automatically deleted.",
        howItWorks: "When you view price history, the system looks up snapshots from 30d and 60d ago (within 7 days tolerance) and calculates the total collection value for those dates.",
        whyOnlyOnePoint: "If you only see 1 data point, it means there's only been 1 day of snapshots created so far. As more daily snapshots are collected, you'll see 30d and 60d points appear automatically."
      }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
