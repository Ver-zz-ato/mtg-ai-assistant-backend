/**
 * Verify MTG legality sync metadata and samples (service role).
 *
 * Usage (from frontend/):
 *   npx tsx scripts/verify-mtg-legality-sync.ts
 *
 * Requires: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { readMtgLegalitySyncStatus, MTG_LEGALITY_SYNC_STATUS_KEY } from "../lib/data/mtg-legality-refresh";
import { normalizeScryfallCacheName } from "../lib/server/scryfallCacheRow";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const sync = await readMtgLegalitySyncStatus(admin);
  console.log("mtg_legality_sync_status:", JSON.stringify(sync, null, 2));

  const { data: banned } = await admin.from("app_config").select("updated_at").eq("key", "banned_cards").maybeSingle();
  const { data: job } = await admin.from("app_config").select("value, updated_at").eq("key", "job:last:mtg-legality-refresh").maybeSingle();
  const { data: row } = await admin.from("app_config").select("updated_at").eq("key", MTG_LEGALITY_SYNC_STATUS_KEY).maybeSingle();

  console.log("banned_cards row updated_at:", banned?.updated_at ?? "(none)");
  console.log("job:last:mtg-legality-refresh:", job?.value, "updated_at:", job?.updated_at);
  console.log(`${MTG_LEGALITY_SYNC_STATUS_KEY} row updated_at:`, row?.updated_at ?? "(none)");

  const keys = ["sol ring", "lightning bolt"].map((n) => normalizeScryfallCacheName(n));
  const { data: samples, error } = await admin.from("scryfall_cache").select("name, legalities").in("name", keys);
  if (error) {
    console.error("scryfall_cache sample query error:", error.message);
    process.exit(1);
  }
  for (const r of samples || []) {
    const leg = (r as { legalities?: Record<string, string> }).legalities;
    const n = (r as { name: string }).name;
    const k = leg && typeof leg === "object" ? Object.keys(leg).length : 0;
    const cmd = leg?.commander ?? "(missing)";
    console.log(`cache[${n}] commander=${cmd} format_keys=${k}`);
  }

  const ok =
    sync.last_success_at &&
    (samples || []).length > 0 &&
    (samples || []).every((r: { legalities?: Record<string, string> }) => {
      const leg = r.legalities;
      return leg && typeof leg === "object" && Object.keys(leg).length > 0;
    });
  console.log(ok ? "\nOK: status + cache samples look populated." : "\nWARN: run full cron or check failures in sync_status.last_error.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
