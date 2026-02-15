import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const maxDuration = 300;

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isAuthorized(req: NextRequest): boolean {
  const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
  const hdr = req.headers.get("x-cron-key") || "";
  const vercelId = req.headers.get("x-vercel-id");
  const url = new URL(req.url);
  const queryKey = url.searchParams.get("key") || "";
  return !!cronKey && (!!vercelId || hdr === cronKey || queryKey === cronKey);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runDeckCosts();
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runDeckCosts();
}

async function runDeckCosts() {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }

  const { data: decks, error: decksError } = await admin
    .from("decks")
    .select("id")
    .eq("is_public", true)
    .eq("format", "Commander");

  if (decksError || !decks || decks.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, total: 0 });
  }

  let updated = 0;
  const BATCH = 50;

  for (let i = 0; i < decks.length; i += BATCH) {
    const batch = decks.slice(i, i + BATCH);
    const deckIds = batch.map((d) => d.id);

    const { data: cards, error: cardsError } = await admin
      .from("deck_cards")
      .select("deck_id, name, qty")
      .in("deck_id", deckIds);

    if (cardsError || !cards) continue;

    const cardNames = [...new Set((cards as { name: string }[]).map((c) => c.name).filter(Boolean))];
    if (cardNames.length === 0) continue;

    const keys = [...new Set(cardNames.map(norm))];

    const priceMap = new Map<string, number>();
    for (let k = 0; k < keys.length; k += 200) {
      const chunk = keys.slice(k, k + 200);
      const { data: prices } = await admin
        .from("price_cache")
        .select("card_name, usd_price")
        .in("card_name", chunk);
      for (const row of prices ?? []) {
        const p = Number((row as { usd_price?: number | null }).usd_price);
        if (!isNaN(p) && p > 0) {
          priceMap.set((row as { card_name: string }).card_name, p);
        }
      }
    }

    if (priceMap.size === 0) continue;

    const totalsByDeck = new Map<string, number>();
    for (const c of cards as { deck_id: string; name: string; qty?: number }[]) {
      const key = norm(c.name);
      const price = priceMap.get(key);
      if (price == null) continue;
      const qty = Math.max(1, c.qty ?? 1);
      const cur = totalsByDeck.get(c.deck_id) ?? 0;
      totalsByDeck.set(c.deck_id, cur + price * qty);
    }

    const rows = Array.from(totalsByDeck.entries()).map(([deck_id, total_usd]) => ({
      deck_id,
      total_usd: Math.round(total_usd * 100) / 100,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      const { error: upsertErr } = await admin
        .from("deck_costs")
        .upsert(rows, { onConflict: "deck_id" });
      if (!upsertErr) updated += rows.length;
    }
  }

  if (updated > 0 || decks.length > 0) {
    await admin.from("app_config").upsert(
      { key: "job:last:deck-costs", value: new Date().toISOString() },
      { onConflict: "key" }
    );
  }

  return NextResponse.json({
    ok: true,
    updated,
    total: decks.length,
  });
}
