import { createClient } from "@/lib/supabase/server";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetchAllRows";
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
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { convert } from "@/lib/currency/rates";
import {
  aggregateDeckQuantitiesByCanonKey,
  normalizeNameToCanonKey,
  normalizedFormatMetadataLabel,
  resolveDeckLineZone,
} from "@/lib/collections/costDeckAggregation";
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

// normalizeNameToCanonKey imported from @/lib/collections/costDeckAggregation (same behavior as legacy local helper).

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
  const norm = normalizeNameToCanonKey(name);
  if (!norm.key) return null;
  return { nameKey: norm.key, qty };
}

// ---- Handler ----
export const POST = withLogging(async (req: Request) => {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));

    const deckId = pick<string>(body, "deckId", "deck_id");
    const formatHint = pick<string>(body, "format");
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

    /**
     * Parsed deck quantities by canonical card key (main + side summed per key for pricing).
     * Optional metadata fields on each row (`inDeckQty`, `zone`, `kind`, `format`) are for newer clients only;
     * legacy fields `card`, `need`, `unit`, `subtotal`, `source` remain the stable contract. `need` is still
     * max(0, inDeckQty − owned): quantity to acquire from the market/collection for this line — not AI-suggested extras.
     */
    const deckAgg = aggregateDeckQuantitiesByCanonKey(deckText, formatHint);
    const formatMeta = normalizedFormatMetadataLabel(formatHint);

    // read owned (optional)
    const ownedMap = new Map<string, number>();
    if (useOwned && collectionId) {
      // Live Supabase uses `collection_cards`; legacy names kept only as last-resort probes.
      const candidateTables = [
        "collection_cards",
        "collection_items",
        "collections_items",
        "user_collection_items",
        "cards_in_collection",
      ];

      let rows: any[] | null = null;
      let lastErr: string | null = null;

      for (const t of candidateTables) {
        const { error: probeErr } = await supabase
          .from(t)
          .select("*")
          .eq("collection_id", collectionId)
          .limit(1);
        if (probeErr) {
          lastErr = probeErr.message || `table ${t} not accessible`;
          continue;
        }
        try {
          rows = await fetchAllSupabaseRows<Record<string, unknown>>(() =>
            supabase
              .from(t)
              .select("*")
              .eq("collection_id", collectionId)
              .order("id", { ascending: true }),
          );
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
          rows = null;
        }
        if (rows) break;
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

    const appliedOwnedEffective = useOwned && !!collectionId;

    // Build pricing list
    const rows: Array<Record<string, unknown>> = [];
    let total = 0;

    for (const [nameKey, agg] of deckAgg.entries()) {
      const qtyWant = agg.total;
      const owned = ownedMap.get(nameKey) || 0;
      const need = Math.max(0, qtyWant - owned);
      if (need === 0) continue;

      const proper = canonicalize(nameKey).canonicalName || nameKey;
      const snapshotNorm = normalizeScryfallCacheName(proper);

      let unit = 0;
      if (useSnapshot) {
        const { data: snap } = await supabase
          .from('price_snapshots')
          .select('unit')
          .eq('snapshot_date', snapshotDate)
          .eq('name_norm', snapshotNorm)
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
            .upsert({ snapshot_date: snapshotDate, name_norm: snapshotNorm, currency, unit, source: 'Scryfall' }, { onConflict: 'snapshot_date,name_norm,currency' });
        }
      }

      const subtotal = unit * need;

      const row: Record<string, unknown> = {
        card: proper,
        need,
        unit,
        subtotal,
        source: useSnapshot ? "Snapshot" : "Scryfall",
        inDeckQty: qtyWant,
        targetQty: qtyWant,
        kind: appliedOwnedEffective ? "missing_from_collection" : "deck_contents",
        zone: resolveDeckLineZone(agg),
      };
      if (formatMeta) row.format = formatMeta;
      rows.push(row);
      total += subtotal;
    }

    // sort biggest first
    rows.sort((a, b) => Number(b.subtotal) - Number(a.subtotal));

    try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer("cost_computed", { currency, total, usedOwned: useOwned && !!collectionId, rows: rows.length, ms: Date.now() - t0 }); } catch {}

    return NextResponse.json({
      ok: true,
      currency,
      rows,
      total,
      appliedOwned: useOwned && !!collectionId,
      prices_updated_at: new Date().toISOString(),
      ...(formatMeta ? { format: formatMeta } : {}),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unhandled error" }, { status: 500 });
  }
});