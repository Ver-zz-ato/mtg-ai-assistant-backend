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
      return NextResponse.json({ ok: true, message: "Collection has no cards" });
    }

    // Normalize card names
    const cardNames = Array.from(new Set(items.map((i: any) => norm(i.name))));
    const cardQuantities = new Map<string, number>();
    for (const item of items) {
      const key = norm(item.name);
      cardQuantities.set(key, (cardQuantities.get(key) || 0) + (item.qty || 1));
    }

    // Check 1: How many unique snapshot dates exist in the entire database?
    const { data: allDates, error: datesError } = await supabase
      .from("price_snapshots")
      .select("snapshot_date")
      .eq("currency", currency)
      .order("snapshot_date", { ascending: false })
      .limit(10000);

    const uniqueDates = new Set<string>();
    (allDates || []).forEach((row: any) => {
      uniqueDates.add(String(row.snapshot_date));
    });
    const dateArray = Array.from(uniqueDates).sort();
    const oldestDate = dateArray[0] || null;
    const newestDate = dateArray[dateArray.length - 1] || null;

    // Check 2: How many snapshots exist for THIS collection's cards?
    const { data: collectionSnapshots, error: snapshotsErr } = await supabase
      .from("price_snapshots")
      .select("name_norm, snapshot_date, unit")
      .in("name_norm", cardNames)
      .eq("currency", currency)
      .order("snapshot_date", { ascending: false })
      .limit(10000);

    // Check 2b: Get a sample of what names actually exist in snapshots (to compare)
    const { data: sampleSnapshots, error: sampleErr } = await supabase
      .from("price_snapshots")
      .select("name_norm")
      .eq("currency", currency)
      .limit(100)
      .order("name_norm", { ascending: true });
    
    const sampleSnapshotNames = Array.from(new Set((sampleSnapshots || []).map((s: any) => String(s.name_norm)))).slice(0, 10);

    const snapshotsByDate = new Map<string, number>();
    const snapshotsByCard = new Map<string, Set<string>>();
    
    (collectionSnapshots || []).forEach((row: any) => {
      const date = String(row.snapshot_date);
      const card = String(row.name_norm);
      
      // Count snapshots per date
      snapshotsByDate.set(date, (snapshotsByDate.get(date) || 0) + 1);
      
      // Track which dates have data for each card
      if (!snapshotsByCard.has(card)) {
        snapshotsByCard.set(card, new Set());
      }
      snapshotsByCard.get(card)!.add(date);
    });

    // Check 3: Which cards have snapshots and which don't?
    const cardsWithSnapshots: string[] = [];
    const cardsWithoutSnapshots: string[] = [];
    
    for (const cardName of cardNames) {
      if (snapshotsByCard.has(cardName) && snapshotsByCard.get(cardName)!.size > 0) {
        cardsWithSnapshots.push(cardName);
      } else {
        cardsWithoutSnapshots.push(cardName);
      }
    }

    // Check 4: Sample a few card names to see if normalization is working
    const sampleCards = cardNames.slice(0, 5);
    const sampleCardData: Record<string, { hasSnapshots: boolean; snapshotDates: number }> = {};
    for (const card of sampleCards) {
      const dates = snapshotsByCard.get(card);
      sampleCardData[card] = {
        hasSnapshots: !!dates && dates.size > 0,
        snapshotDates: dates ? dates.size : 0
      };
    }

    // Check 5: Calculate what 30d/60d would look like
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    
    const datesWithData = Array.from(snapshotsByDate.keys()).sort();
    const has30dData = datesWithData.some(date => {
      const dateObj = new Date(date);
      const diff = Math.abs(dateObj.getTime() - thirtyDaysAgo.getTime());
      return diff <= 7 * 24 * 60 * 60 * 1000;
    });
    
    const has60dData = datesWithData.some(date => {
      const dateObj = new Date(date);
      const diff = Math.abs(dateObj.getTime() - sixtyDaysAgo.getTime());
      return diff <= 7 * 24 * 60 * 60 * 1000;
    });

    return NextResponse.json({
      ok: true,
      currency,
      databaseStats: {
        totalUniqueSnapshotDates: uniqueDates.size,
        oldestDate,
        newestDate,
        dateRange: oldestDate && newestDate 
          ? `${oldestDate} to ${newestDate} (${uniqueDates.size} days)`
          : "No snapshots in database",
        sampleSnapshotNames // Show what names actually exist in snapshots
      },
      collectionStats: {
        totalCards: cardNames.length,
        cardsWithSnapshots: cardsWithSnapshots.length,
        cardsWithoutSnapshots: cardsWithoutSnapshots.length,
        uniqueDatesForCollection: snapshotsByDate.size,
        datesWithData: datesWithData.slice(0, 10), // First 10 dates
        totalSnapshotRows: collectionSnapshots?.length || 0,
        collectionCardNames: cardNames.slice(0, 10) // Show what names we're searching for
      },
      sampleCards: sampleCardData,
      historyAvailability: {
        has30dData,
        has60dData,
        canShowHistory: snapshotsByDate.size >= 2
      },
      diagnosis: {
        issue: snapshotsByDate.size === 0 
          ? "No snapshots found for any cards in this collection. Either snapshots don't exist for these cards, or card name normalization isn't matching."
          : snapshotsByDate.size === 1
          ? `Only 1 date has snapshots for this collection's cards. This is why you only see 1 data point.`
          : `Found ${snapshotsByDate.size} dates with snapshot data. History should be working.`,
        recommendation: cardsWithoutSnapshots.length > 0
          ? `${cardsWithoutSnapshots.length} cards in collection have no snapshots. Compare the 'collectionCardNames' with 'sampleSnapshotNames' to see if there's a normalization mismatch.`
          : "All cards have snapshots, but they might all be from the same date."
      }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
