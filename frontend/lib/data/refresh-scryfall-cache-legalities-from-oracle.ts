/**
 * Refresh scryfall_cache.legalities (and merged oracle fields) from Scryfall oracle_cards bulk.
 * Only updates rows that already exist in scryfall_cache; skips unchanged legalities JSON.
 */
import { Readable } from "stream";
import { finished } from "stream/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StreamArray = require("stream-json/streamers/StreamArray") as {
  withParser: (opts?: unknown) => NodeJS.ReadWriteStream;
};

import { getOracleCardsBulkUri } from "./build-banned-lists-from-scryfall";
import {
  mergeScryfallCacheRowFromApiCard,
  normalizeScryfallCacheName,
  type ScryfallApiCard,
} from "@/lib/server/scryfallCacheRow";

function stableLegalitiesJson(leg: unknown): string {
  if (leg == null || typeof leg !== "object" || Array.isArray(leg)) return "null";
  const o = leg as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const sorted: Record<string, string> = {};
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string") sorted[k] = v;
  }
  return JSON.stringify(sorted);
}

async function processBatch(
  admin: SupabaseClient,
  batch: ScryfallApiCard[],
  counters: {
    scanned: number;
    updated: number;
    skippedNoRow: number;
    skippedUnchanged: number;
  },
  log: (m: string) => void
): Promise<void> {
  const cardByKey = new Map<string, ScryfallApiCard>();
  for (const c of batch) {
    const raw = String(c?.name || "").trim();
    if (!raw) continue;
    const k = normalizeScryfallCacheName(raw);
    if (k) cardByKey.set(k, c);
  }
  const uniqueKeys = [...cardByKey.keys()];
  if (uniqueKeys.length === 0) return;

  const { data: existingRows, error } = await admin.from("scryfall_cache").select("*").in("name", uniqueKeys);
  if (error) throw new Error(`scryfall_cache select: ${error.message}`);

  const existingByName = new Map<string, Record<string, unknown>>();
  for (const r of existingRows || []) {
    const row = r as Record<string, unknown>;
    const n = row.name;
    if (typeof n === "string" && n) existingByName.set(n, row);
  }

  const upserts: Record<string, unknown>[] = [];
  for (const k of uniqueKeys) {
    const existing = existingByName.get(k);
    if (!existing) {
      counters.skippedNoRow += 1;
      continue;
    }
    const card = cardByKey.get(k);
    if (!card) continue;
    const merged = mergeScryfallCacheRowFromApiCard(existing, card, { source: "oracle-legality-refresh" });
    if (!merged) continue;
    if (stableLegalitiesJson(existing.legalities) === stableLegalitiesJson(merged.legalities)) {
      counters.skippedUnchanged += 1;
      continue;
    }
    upserts.push(merged);
  }

  if (upserts.length === 0) return;

  const { error: upErr } = await admin.from("scryfall_cache").upsert(upserts, { onConflict: "name" });
  if (upErr) throw new Error(`scryfall_cache upsert: ${upErr.message}`);
  counters.updated += upserts.length;
  log(`[oracle-legality-refresh] merged ${upserts.length} rows (batch)`);
}

export type RefreshScryfallLegalitiesResult = {
  scanned: number;
  updated: number;
  skippedNoRow: number;
  skippedUnchanged: number;
};

/**
 * Second download of oracle_cards bulk (after banned build) to patch cache legalities in batches.
 */
export async function refreshScryfallCacheLegalitiesFromOracle(
  admin: SupabaseClient,
  options?: { batchSize?: number; log?: (m: string) => void }
): Promise<RefreshScryfallLegalitiesResult> {
  const batchSize = Math.min(150, Math.max(30, options?.batchSize ?? 90));
  const log = options?.log ?? (() => {});

  const uri = await getOracleCardsBulkUri();
  // External Scryfall bulk stream (same as build-banned-lists-from-scryfall).
  // eslint-disable-next-line no-restricted-globals -- Scryfall oracle_cards bulk URI
  const res = await fetch(uri);
  if (!res.body) throw new Error("oracle_cards bulk: empty body");

  const counters: RefreshScryfallLegalitiesResult = {
    scanned: 0,
    updated: 0,
    skippedNoRow: 0,
    skippedUnchanged: 0,
  };

  const buffer: ScryfallApiCard[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeStream = Readable.fromWeb(res.body as any);
  const pipeline = nodeStream.pipe(StreamArray.withParser());

  let tail = Promise.resolve();
  pipeline.on("data", ({ value }: { value: ScryfallApiCard }) => {
    const name = String(value?.name || "").trim();
    if (!name || !value?.legalities || typeof value.legalities !== "object") return;
    counters.scanned += 1;
    buffer.push(value);
    if (buffer.length >= batchSize) {
      const slice = buffer.splice(0, batchSize);
      tail = tail.then(() => processBatch(admin, slice, counters, log));
    }
  });

  await finished(pipeline);
  if (buffer.length > 0) {
    const slice = buffer.splice(0);
    tail = tail.then(() => processBatch(admin, slice, counters, log));
  }
  await tail;

  log(
    `[oracle-legality-refresh] done scanned=${counters.scanned} updated=${counters.updated} skippedNoRow=${counters.skippedNoRow} skippedUnchanged=${counters.skippedUnchanged}`
  );
  return counters;
}
