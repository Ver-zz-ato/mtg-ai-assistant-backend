#!/usr/bin/env tsx
/**
 * One-off dev proof: scryfall_cache.printed_name is populated when Scryfall returns
 * a distinct printed_name + root image_uris (production row builder only).
 *
 * Card (fixed): SLD #430 — "Aisha of Sparks and Smoke" (oracle / deck identity)
 * with printed_name "Ken, Burning Brawler" (SL × Street Fighter skin). Scryfall
 * documents both fields on the same English JSON object; PK stays oracle name.
 *
 * Usage (from frontend/):
 *   npx tsx scripts/prove-printed-name-scryfall-cache.ts
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: DRY_RUN=1 — fetch + build + log only, no upsert
 *
 * Cleanup: delete this file (and optional package.json script) when done.
 */

import * as path from "path";
import * as fs from "fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import {
  buildScryfallCacheRowFromApiCard,
  type ScryfallApiCard,
} from "../lib/server/scryfallCacheRow";

for (const p of [path.join(process.cwd(), ".env.local"), ".env.local"]) {
  if (fs.existsSync(p)) {
    config({ path: p });
    break;
  }
}

/** Stable English printing: oracle ≠ printed_name, root image_uris (verified vs api.scryfall.com). */
const SCRYFALL_CARD_URL =
  "https://api.scryfall.com/cards/sld/430?format=json";

const USER_AGENT = "ManaTap-ProofPrintedName/1.0 (https://manatap.ai)";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dry = String(process.env.DRY_RUN || "").trim() === "1";

  const res = await fetch(SCRYFALL_CARD_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    console.error("Scryfall fetch failed:", res.status, await res.text());
    process.exit(1);
  }
  const card = (await res.json()) as ScryfallApiCard;

  const oracle = String(card.name ?? "");
  const printed = card.printed_name != null ? String(card.printed_name) : "";
  const hasRootImg =
    !!card.image_uris &&
    typeof card.image_uris === "object" &&
    !!(card.image_uris as { normal?: string }).normal;

  console.log("Scryfall object:", {
    oracle_name: oracle,
    printed_name: printed || "(empty)",
    has_root_image_uris: hasRootImg,
    set: card.set,
    collector_number: card.collector_number,
    lang: card.lang,
  });

  if (!printed.trim()) {
    console.error("Abort: Scryfall returned no printed_name — pick another printing.");
    process.exit(1);
  }
  if (!hasRootImg) {
    console.error("Abort: expected root image_uris for printed_name source = root.");
    process.exit(1);
  }

  const row = buildScryfallCacheRowFromApiCard(card, {
    source: "scripts/prove-printed-name-scryfall-cache",
  });
  if (!row) {
    console.error("buildScryfallCacheRowFromApiCard returned null");
    process.exit(1);
  }

  console.log("Built row (subset):", {
    name: row.name,
    printed_name: row.printed_name,
    set: row.set,
    collector_number: row.collector_number,
  });

  if (row.name !== "aisha of sparks and smoke") {
    console.warn("Unexpected PK name normalization — check Scryfall oracle name.");
  }
  if (row.printed_name !== "Ken, Burning Brawler") {
    console.warn("Unexpected printed_name — Scryfall data may have changed; verify manually.");
  }

  if (dry) {
    console.log("DRY_RUN=1 — skipping Supabase upsert.");
    return;
  }

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.from("scryfall_cache").upsert(row, {
    onConflict: "name",
  });
  if (error) {
    console.error("Upsert failed:", error.message);
    process.exit(1);
  }

  console.log("Upsert OK. Verify in SQL:");
  console.log(
    `  SELECT name, printed_name, updated_at FROM public.scryfall_cache WHERE name = 'aisha of sparks and smoke';`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
