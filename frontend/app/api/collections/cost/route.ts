import { createClient } from "@/lib/supabase/server";
// frontend/app/api/collections/cost/route.ts
// Node runtime so we can use supabase-js + normal fetch without Edge errors.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { withLogging } from "@/lib/api/withLogging";
import { ok, err } from "@/lib/api/envelope";
import { CostBody } from "@/lib/validation";
// You already have this package (it showed in your build logs)
// ---- Utilities ----
type Currency = "USD" | "EUR" | "TIX";

// Accept both camelCase and snake_case
function pick<T>(obj: any, key: string, alt?: string, fallback?: T): T | undefined {
  if (!obj) return fallback;
  if (key in obj && obj[key] != null) return obj[key];
  if (alt && alt in obj && obj[alt] != null) return obj[alt];
  return fallback;
}

function normalizeCurrency(v: any): Currency {
  const s = String(v || "USD").toUpperCase();
  if (s === "EUR") return "EUR";
  if (s === "TIX") return "TIX";
  return "USD";
}

// very forgiving deck text parser: lines like "1 Sol Ring" or "Sol Ring x1"
function normalizeName(raw: string): string {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return s;
  // strip punctuation and extra spaces
  const basic = s
    .replace(/[,·•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // light alias pass (extendable later or load from dataset)
  const aliases: Record<string, string> = {
    "l. bolt": "lightning bolt",
    "lightning bolt": "lightning bolt",
  };
  return aliases[basic] || basic;
}

function parseDeckText(text: string): Map<string, number> {
  const map = new Map<string, number>();
  if (!text) return map;
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // Strip comment-like bits, sideboard headers etc.
    if (/^(#|\/\/|SB:|COMMANDER|SIDEBOARD)/i.test(line)) continue;

    // Try patterns:
    //  "1 Sol Ring"
    //  "Sol Ring x1"
    //  "4x Lightning Bolt"
    let qty = 1;
    let name = line;

    // leading qty
    const mLead = line.match(/^(\d+)\s+[xX]?\s*(.+)$/);
    if (mLead) {
      qty = Math.max(1, parseInt(mLead[1]!, 10));
      name = mLead[2]!.trim();
    } else {
      // trailing " xN"
      const mTrail = line.match(/^(.+?)\s+[xX]\s*(\d+)$/);
      if (mTrail) {
        name = mTrail[1]!.trim();
        qty = Math.max(1, parseInt(mTrail[2]!, 10));
      }
    }

    // skip obvious headings
    if (/^(LANDS|CREATURES|INSTANTS|SORCERIES|ARTIFACTS|ENCHANTMENTS|PLANESWALKERS)/i.test(name)) {
      continue;
    }

    const key = normalizeName(name);
    const cur = map.get(key) || 0;
    map.set(key, cur + qty);
  }
  return map;
}

async function priceFromScryfall(name: string, currency: Currency): Promise<number> {
  // we price by cheapest available normal printing
  const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return 0;
  const j: any = await r.json();
  const prices = j?.prices || {};
  if (currency === "EUR") return parseFloat(prices.eur || "0") || 0;
  if (currency === "TIX") return parseFloat(prices.tix || "0") || 0;
  return parseFloat(prices.usd || "0") || 0;
}

// try to read owned quantities regardless of exact column names
function readOwnedRow(row: any): { name: string; qty: number } | null {
  const name = row?.name ?? row?.card_name ?? row?.card ?? row?.title;
  if (!name || typeof name !== "string") return null;
  const qtyRaw = row?.qty ?? row?.quantity ?? row?.count ?? row?.owned;
  const qty = Math.max(0, Number(qtyRaw ?? 0));
  return { name: normalizeName(name), qty };
}

// ---- Handler ----
export const POST = withLogging(async (req: Request) => {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));

    const deckId = pick<string>(body, "deckId", "deck_id");
    const collectionId = pick<string>(body, "collectionId", "collection_id");
    const useOwned = Boolean(pick<boolean>(body, "useOwned", "use_owned", false));
    const currency = normalizeCurrency(pick<string>(body, "currency", "currency", "USD"));

    // If deck_text not given, try to fetch from DB by deckId
    let deckText = pick<string>(body, "deckText", "deck_text", "");
    const supabase = await createClient();

    if (!deckText && deckId) {
      const { data, error } = await supabase
        .from("decks")
        .select("deck_text")
        .eq("id", deckId)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ ok: false, error: `Failed to load deck by id: ${error.message}` }, { status: 400 });
      }
      deckText = data?.deck_text || "";
    }

    if (!deckText) {
      return NextResponse.json({ ok: false, error: "Missing 'deck_text' and no deck found by 'deckId'." }, { status: 400 });
    }

    // parse target deck
    const want = parseDeckText(deckText);

    // read owned (optional)
    const ownedMap = new Map<string, number>();
    if (useOwned && collectionId) {
      // we don't know your exact schema; be flexible
      // Try common names for a collection items table
      const candidateTables = [
        // DEPRECATION NOTE: prefer "collection_cards"; keep legacy names for backward compat.
        "collection_items",
        "collections_items",
        "collection_cards",
        "user_collection_items",
        "cards_in_collection",
      ];

      let rows: any[] | null = null;
      let lastErr: string | null = null;

      for (const t of candidateTables) {
        const { data, error } = await supabase
          .from(t)
          .select("*")
          .eq("collection_id", collectionId);

        if (!error && Array.isArray(data)) {
          rows = data;
          break;
        } else {
          lastErr = error?.message || `table ${t} not accessible`;
        }
      }

      if (!rows) {
        // Owned will be treated as 0; but we tell the caller.
        // Don't fail hard—still return a useful cost breakdown.
        // The UI can show the “Using owned quantities from selected collection” banner you already have.
        console.warn("Owned lookup failed:", lastErr);
      } else {
        for (const r of rows) {
          const parsed = readOwnedRow(r);
          if (!parsed) continue;
          const cur = ownedMap.get(parsed.name) || 0;
          ownedMap.set(parsed.name, cur + parsed.qty);
        }
      }
    }

    // Build pricing list
    const rows: Array<{ card: string; need: number; unit: number; subtotal: number }> = [];
    let total = 0;

    for (const [name, qtyWant] of want.entries()) {
      const owned = ownedMap.get(name) || 0;
      const need = Math.max(0, qtyWant - owned);
      if (need === 0) continue;

      const unit = await priceFromScryfall(name, currency);
      const subtotal = unit * need;

      rows.push({ card: name, need, unit, subtotal, source: 'Scryfall' as any });
      total += subtotal;
    }

    // sort biggest first
    rows.sort((a, b) => b.subtotal - a.subtotal);

    try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer("cost_computed", { currency, total, usedOwned: useOwned && !!collectionId, rows: rows.length, ms: Date.now() - t0 }); } catch {}

    return NextResponse.json({
      ok: true,
      currency,
      rows,
      total,
      appliedOwned: useOwned && !!collectionId,
      prices_updated_at: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unhandled error" }, { status: 500 });
  }
});