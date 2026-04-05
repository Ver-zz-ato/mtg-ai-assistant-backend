/**
 * Build daily price_snapshots from Scryfall's default_cards bulk JSON:
 * median USD/EUR per normalized card name, GBP derived from USD × FX.
 * Used by /api/bulk-jobs/price-snapshot and /api/cron/price/snapshot so production and local admin match.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeScryfallCacheName as norm } from "@/lib/server/scryfallCacheRow";

// `name_norm` on inserted rows = `norm` above. Readers (e.g. GET /api/price/series) must use the same
// `normalizeScryfallCacheName` — not `price_cache.card_name` normalization.

function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function fetchScryfallDefaultCardsBulk(): Promise<any[]> {
  console.log("📥 Fetching Scryfall bulk data metadata...");
  const meta = await fetch("https://api.scryfall.com/bulk-data", { cache: "no-store" }).then((r) => r.json());
  const entry = (meta?.data || []).find((d: any) => d?.type === "default_cards");
  const url = entry?.download_uri;
  if (!url) throw new Error("No bulk download uri");
  console.log(
    `⬇️ Downloading bulk card data from Scryfall (${entry?.size ? Math.round(entry.size / 1024 / 1024) : "?"}MB)...`
  );
  const data = await fetch(url, { cache: "no-store" }).then((r) => r.json());
  const cards = Array.isArray(data) ? data : [];
  console.log(`✅ Downloaded ${cards.length} cards from Scryfall bulk data`);
  return cards;
}

export type PriceSnapshotBulkResult = {
  inserted: number;
  snapshot_date: string;
  unique_cards: number;
};

/**
 * @param supabase Service-role Supabase client (write price_snapshots).
 */
export async function runPriceSnapshotFromScryfallBulk(supabase: SupabaseClient): Promise<PriceSnapshotBulkResult> {
  const all = await fetchScryfallDefaultCardsBulk();
  console.log(`🔄 Processing ${all.length} cards and aggregating prices...`);

  const byName = new Map<string, { usd: number[]; eur: number[] }>();
  let processed = 0;
  for (const c of all) {
    processed++;
    if (processed % 10000 === 0) {
      console.log(`   Processed ${processed}/${all.length} cards (${Math.round((processed / all.length) * 100)}%)...`);
    }
    const n = norm(c?.name || "");
    if (!n) continue;
    const usd = c?.prices?.usd ? Number(c.prices.usd) : null;
    const eur = c?.prices?.eur ? Number(c.prices.eur) : null;
    if (!byName.has(n)) byName.set(n, { usd: [], eur: [] });
    const ref = byName.get(n)!;
    if (usd != null) ref.usd.push(usd);
    if (eur != null) ref.eur.push(eur);
  }
  console.log(`✅ Aggregated prices for ${byName.size} unique card names`);

  const today = new Date().toISOString().slice(0, 10);
  const rows: any[] = [];
  const rowsGBP: any[] = [];

  console.log("💱 Fetching GBP exchange rate...");
  let usd_gbp = 0.78;
  try {
    const fx = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=GBP", { cache: "no-store" }).then((r) =>
      r.json()
    );
    usd_gbp = Number(fx?.rates?.GBP || 0.78);
    console.log(`   USD to GBP rate: ${usd_gbp}`);
  } catch {
    console.warn("⚠️ Could not fetch GBP rate, using default 0.78");
  }

  console.log("📊 Generating snapshot rows (USD, EUR, GBP)...");
  for (const [k, v] of byName.entries()) {
    const medUSD = median(v.usd);
    const medEUR = median(v.eur);
    if (medUSD != null)
      rows.push({ snapshot_date: today, name_norm: k, currency: "USD", unit: +medUSD.toFixed(2), source: "ScryfallBulk" });
    if (medEUR != null)
      rows.push({ snapshot_date: today, name_norm: k, currency: "EUR", unit: +medEUR.toFixed(2), source: "ScryfallBulk" });
    if (medUSD != null)
      rowsGBP.push({
        snapshot_date: today,
        name_norm: k,
        currency: "GBP",
        unit: +(medUSD * usd_gbp).toFixed(2),
        source: "ScryfallBulk",
      });
  }

  const allRows = [...rows, ...rowsGBP];
  console.log(`💾 Inserting ${allRows.length} snapshot rows into database (in batches of 1000)...`);
  let inserted = 0;
  for (let i = 0; i < allRows.length; i += 1000) {
    const chunk = allRows.slice(i, i + 1000);
    const { error } = await supabase.from("price_snapshots").upsert(chunk, { onConflict: "snapshot_date,name_norm,currency" });
    if (error) {
      throw new Error(error.message);
    }
    inserted += chunk.length;
    if (i % 10000 === 0 && i > 0) {
      console.log(`   Inserted ${inserted}/${allRows.length} rows (${Math.round((inserted / allRows.length) * 100)}%)...`);
    }
  }
  console.log(`✅ Successfully inserted ${inserted} snapshot rows`);

  const runCleanup = async () => {
    try {
      const { getAdmin } = await import("@/app/api/_lib/supa");
      const admin = getAdmin();
      if (!admin) return;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 60);
      const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);
      const { data: oldestRow } = await admin
        .from("price_snapshots")
        .select("snapshot_date")
        .lt("snapshot_date", cutoffDateStr)
        .order("snapshot_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!oldestRow?.snapshot_date) return;
      const startDate = new Date(oldestRow.snapshot_date);
      const endDate = new Date(cutoffDateStr);
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      let totalDeleted = 0;
      for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        for (const c of chars) {
          const { data, error: err } = await admin
            .from("price_snapshots")
            .delete()
            .eq("snapshot_date", dateStr)
            .like("name_norm", `${c}%`)
            .select("snapshot_date");
          if (!err && Array.isArray(data)) totalDeleted += data.length;
        }
        const { data, error: err } = await admin
          .from("price_snapshots")
          .delete()
          .eq("snapshot_date", dateStr)
          .is("name_norm", null)
          .select("snapshot_date");
        if (!err && Array.isArray(data)) totalDeleted += data.length;
      }
      console.log(`🧹 Background cleanup: deleted ${totalDeleted.toLocaleString()} old snapshot rows`);
    } catch (e: any) {
      console.warn("⚠️ Background cleanup error:", e?.message || e);
    }
  };
  void runCleanup();

  return { inserted, snapshot_date: today, unique_cards: byName.size };
}
