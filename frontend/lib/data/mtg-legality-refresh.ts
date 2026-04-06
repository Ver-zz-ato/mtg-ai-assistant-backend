/**
 * Orchestrates banned overlay (app_config) + scryfall_cache legalities refresh from Scryfall oracle bulk.
 * Idempotent; failures after a successful banned_cards write still leave prior cache rows intact.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAndBuildBannedLists, type BannedCardsData } from "./build-banned-lists-from-scryfall";
import { refreshScryfallCacheLegalitiesFromOracle, type RefreshScryfallLegalitiesResult } from "./refresh-scryfall-cache-legalities-from-oracle";

/** app_config.key for JSON status blob */
export const MTG_LEGALITY_SYNC_STATUS_KEY = "mtg_legality_sync_status";

export type MtgLegalitySyncStatus = {
  last_success_at: string | null;
  last_banned_refresh_at: string | null;
  last_cache_legalities_at: string | null;
  last_oracle_cards_scanned: number;
  last_cache_rows_updated: number;
  last_skipped_no_row: number;
  last_skipped_unchanged: number;
  last_banned_counts: Record<string, number> | null;
  last_error: string | null;
  last_run_at: string | null;
};

function emptyStatus(): MtgLegalitySyncStatus {
  return {
    last_success_at: null,
    last_banned_refresh_at: null,
    last_cache_legalities_at: null,
    last_oracle_cards_scanned: 0,
    last_cache_rows_updated: 0,
    last_skipped_no_row: 0,
    last_skipped_unchanged: 0,
    last_banned_counts: null,
    last_error: null,
    last_run_at: null,
  };
}

export async function readMtgLegalitySyncStatus(admin: SupabaseClient): Promise<MtgLegalitySyncStatus> {
  const { data, error } = await admin
    .from("app_config")
    .select("value")
    .eq("key", MTG_LEGALITY_SYNC_STATUS_KEY)
    .maybeSingle();
  if (error || data?.value == null || typeof data.value !== "object") return emptyStatus();
  const v = data.value as Record<string, unknown>;
  const base = emptyStatus();
  return {
    ...base,
    last_success_at: typeof v.last_success_at === "string" ? v.last_success_at : null,
    last_banned_refresh_at: typeof v.last_banned_refresh_at === "string" ? v.last_banned_refresh_at : null,
    last_cache_legalities_at: typeof v.last_cache_legalities_at === "string" ? v.last_cache_legalities_at : null,
    last_oracle_cards_scanned: typeof v.last_oracle_cards_scanned === "number" ? v.last_oracle_cards_scanned : 0,
    last_cache_rows_updated: typeof v.last_cache_rows_updated === "number" ? v.last_cache_rows_updated : 0,
    last_skipped_no_row: typeof v.last_skipped_no_row === "number" ? v.last_skipped_no_row : 0,
    last_skipped_unchanged: typeof v.last_skipped_unchanged === "number" ? v.last_skipped_unchanged : 0,
    last_banned_counts: v.last_banned_counts && typeof v.last_banned_counts === "object" ? (v.last_banned_counts as Record<string, number>) : null,
    last_error: typeof v.last_error === "string" ? v.last_error : null,
    last_run_at: typeof v.last_run_at === "string" ? v.last_run_at : null,
  };
}

async function writeSyncStatus(admin: SupabaseClient, status: MtgLegalitySyncStatus): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin.from("app_config").upsert(
    {
      key: MTG_LEGALITY_SYNC_STATUS_KEY,
      value: status,
      updated_at: now,
    },
    { onConflict: "key" }
  );
  if (error) console.error("[mtg-legality-refresh] failed to write sync status:", error.message);
}

function bannedCounts(data: BannedCardsData): Record<string, number> {
  return {
    Commander: data.Commander.length,
    Modern: data.Modern.length,
    Pioneer: data.Pioneer.length,
    Standard: data.Standard.length,
    Pauper: data.Pauper.length,
    Brawl: data.Brawl.length,
  };
}

/** Banned lists only (single oracle bulk download). Updates job:last:update-banned-lists. */
export async function refreshBannedListsOnly(admin: SupabaseClient): Promise<{
  banned: BannedCardsData;
  counts: Record<string, number>;
}> {
  const banned = await fetchAndBuildBannedLists();
  const now = new Date().toISOString();
  const { error } = await admin.from("app_config").upsert(
    { key: "banned_cards", value: banned, updated_at: now },
    { onConflict: "key" }
  );
  if (error) throw new Error(error.message);

  await admin.from("app_config").upsert(
    {
      key: "job:last:update-banned-lists",
      value: now,
      updated_at: now,
    },
    { onConflict: "key" }
  );

  return { banned, counts: bannedCounts(banned) };
}

export type MtgLegalityFullRefreshResult = {
  banned: BannedCardsData;
  legalities: RefreshScryfallLegalitiesResult;
};

/**
 * Full refresh: oracle bulk → banned_cards app_config, then second oracle bulk → cache legalities merges.
 */
export async function runMtgLegalityFullRefresh(
  admin: SupabaseClient,
  options?: { log?: (m: string) => void }
): Promise<MtgLegalityFullRefreshResult> {
  const log = options?.log ?? ((m: string) => console.log(m));
  const runAt = new Date().toISOString();
  const prev = await readMtgLegalitySyncStatus(admin);

  let banned: BannedCardsData;
  try {
    ({ banned } = await refreshBannedListsOnly(admin));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[mtg-legality-refresh] banned refresh failed:", e);
    await writeSyncStatus(admin, { ...prev, last_run_at: runAt, last_error: `banned: ${msg}` });
    throw e;
  }

  const bannedAt = new Date().toISOString();
  log(`[mtg-legality-refresh] banned_cards updated at ${bannedAt}`);

  let legalities: RefreshScryfallLegalitiesResult;
  try {
    legalities = await refreshScryfallCacheLegalitiesFromOracle(admin, { log });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[mtg-legality-refresh] cache legalities refresh failed:", e);
    await writeSyncStatus(admin, {
      ...prev,
      last_run_at: runAt,
      last_banned_refresh_at: bannedAt,
      last_banned_counts: bannedCounts(banned),
      last_error: `cache_legalities: ${msg}`,
    });
    throw e;
  }

  const doneAt = new Date().toISOString();
  await writeSyncStatus(admin, {
    last_success_at: doneAt,
    last_banned_refresh_at: bannedAt,
    last_cache_legalities_at: doneAt,
    last_oracle_cards_scanned: legalities.scanned,
    last_cache_rows_updated: legalities.updated,
    last_skipped_no_row: legalities.skippedNoRow,
    last_skipped_unchanged: legalities.skippedUnchanged,
    last_banned_counts: bannedCounts(banned),
    last_error: null,
    last_run_at: runAt,
  });

  await admin.from("app_config").upsert(
    {
      key: "job:last:mtg-legality-refresh",
      value: doneAt,
      updated_at: doneAt,
    },
    { onConflict: "key" }
  );

  return { banned, legalities };
}
