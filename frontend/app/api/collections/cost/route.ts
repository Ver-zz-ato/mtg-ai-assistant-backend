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
import { canonicalize } from "@/lib/cards/canonicalize";
import { convert } from "@/lib/currency/rates";
// ---- Utilities ----
type Currency = "USD" | "EUR" | "GBP" | "TIX";

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
  if (s === "GBP") return "GBP";
  if (s === "TIX") return "TIX";
  return "USD";
}

// very forgiving deck text parser: lines like "1 Sol Ring" or "Sol Ring x1"
function normalizeName(raw: string): { key: string; canon: string } {
  const s = String(raw || "").trim();
  if (!s) return { key: "", canon: "" };
  // strip punctuation and extra spaces
  const basic = s
    .replace(/[,·•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const { canonicalName } = canonicalize(basic);
  const canon = canonicalName || basic;
  const key = canon.toLowerCase();
  return { key, canon };
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

    const norm = normalizeName(name);
    if (!norm.key) continue;
    const cur = map.get(norm.key) || 0;
    map.set(norm.key, cur + qty);
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
  const usd = parseFloat(prices.usd || "0") || 0;
  const eur = parseFloat(prices.eur || "0") || 0;
  const tix = parseFloat(prices.tix || "0") || 0;
  if (currency === "TIX") return tix;
  // Pick the best base we have, then convert to requested
  let base = 0; let baseCur: "USD" | "EUR" = "USD";
  if (usd > 0) { base = usd; baseCur = "USD"; }
  else if (eur > 0) { base = eur; baseCur = "EUR"; }
  else { return 0; }
  return await convert(base, baseCur as any, currency as any);
}
function readOwnedRow(row: any): { nameKey: string; qty: number } | null {
  const name = String(row?.name || row?.card || row?.card_name || row?.title || '').trim();
  const qtyRaw = row?.qty ?? row?.quantity ?? row?.count ?? row?.owned;
  const qty = Math.max(0, Number(qtyRaw ?? 0));
  const norm = normalizeName(name);
  if (!norm.key) return null;
  return { nameKey: norm.key, qty };
}

// ---- Handler ----
export const POST = withLogging(async (req: Request) => {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));

    const deckId = pick<string>(body, "deckId", "deck_id");
    const collectionId = pick<string>(body, "collectionId", "collection_id");
    const useOwned = Boolean(pick<boolean>(body, "useOwned", "use_owned", false));
    const currency = normalizeCurrency(String(pick<string>(body, "currency", "currency", "USD")).toUpperCase());
    const useSnapshot = Boolean(pick<boolean>(body, "useSnapshot", "use_snapshot", false));
    const snapshotDate = String(pick<string>(body, "snapshotDate", "snapshot_date", new Date().toISOString().slice(0,10))).slice(0,10);

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
          const cur = ownedMap.get(parsed.nameKey) || 0;
          ownedMap.set(parsed.nameKey, cur + parsed.qty);
        }
      }
    }

    // Build pricing list
    const rows: Array<{ card: string; need: number; unit: number; subtotal: number; source?: string | null }> = [];
    let total = 0;

    for (const [name, qtyWant] of want.entries()) {
      const owned = ownedMap.get(name) || 0;
      const need = Math.max(0, qtyWant - owned);
      if (need === 0) continue;

      const proper = canonicalize(name).canonicalName || name;

      let unit = 0;
      if (useSnapshot) {
        const { data: snap } = await supabase
          .from('price_snapshots')
          .select('unit')
          .eq('snapshot_date', snapshotDate)
          .eq('name_norm', name)
          .eq('currency', currency)
          .maybeSingle();
        unit = Number((snap as any)?.unit || 0);
      }

      if (!unit || unit <= 0) {
        unit = await priceFromScryfall(proper, currency);
        if (useSnapshot && unit > 0) {
          // Upsert into snapshot table for reuse within the day
          await supabase
            .from('price_snapshots')
            .upsert({ snapshot_date: snapshotDate, name_norm: name, currency, unit, source: 'Scryfall' }, { onConflict: 'snapshot_date,name_norm,currency' });
        }
      }

      const subtotal = unit * need;

      rows.push({ card: proper, need, unit, subtotal, source: useSnapshot ? 'Snapshot' : 'Scryfall' });
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