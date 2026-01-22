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

    // Calculate date range (last N days)
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - days * 24 * 60 * 60 * 1000);
    const fromStr = fromDate.toISOString().slice(0, 10);

    // Get all snapshots in date range for these cards
    const { data: snapshots, error: snapshotsErr } = await supabase
      .from("price_snapshots")
      .select("name_norm, snapshot_date, unit")
      .in("name_norm", cardNames)
      .eq("currency", currency)
      .gte("snapshot_date", fromStr)
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

    // Convert to array of points
    const points = Array.from(byDate.entries())
      .map(([date, total]) => ({ date, total: Number(total.toFixed(2)) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json(
      { ok: true, currency, points },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" } }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
