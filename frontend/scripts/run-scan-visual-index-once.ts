/**
 * Run scan visual index build locally (uses .env.local service role).
 * Usage: npx tsx scripts/run-scan-visual-index-once.ts [limit]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  buildVisualIndexArtifacts,
  fetchScryfallCacheArtRows,
} from "../lib/server/scanVisualIndex/build";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i);
    const val = t.slice(i + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE url or service role in .env.local");
    process.exit(1);
  }
  const limit = Number(process.argv[2] || "500");
  const version = Number(process.env.SCAN_VISUAL_INDEX_VERSION || "1");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  console.log("Fetching scryfall_cache rows…");
  let rows = await fetchScryfallCacheArtRows(admin);
  if (limit > 0) rows = rows.slice(0, limit);
  console.log(`Building index for ${rows.length} cards…`);

  const built = await buildVisualIndexArtifacts(rows, (p) => {
    if (p.processed % 100 === 0 || p.processed === p.total) {
      console.log(`  ${p.processed}/${p.total} skipped=${p.skipped}`);
    }
  });

  const bucket = "scan-index";
  const aPath = `v${version}/scan-index-a.bin`;
  const bPath = `v${version}/scan-index-b.bin`;

  const { error: upA } = await admin.storage.from(bucket).upload(aPath, built.indexA, {
    contentType: "application/octet-stream",
    upsert: true,
  });
  if (upA) throw new Error(upA.message);

  const { error: upB } = await admin.storage.from(bucket).upload(bPath, built.indexB, {
    contentType: "application/octet-stream",
    upsert: true,
  });
  if (upB) throw new Error(upB.message);

  const { data: pubA } = admin.storage.from(bucket).getPublicUrl(aPath);
  const { data: pubB } = admin.storage.from(bucket).getPublicUrl(bPath);

  const manifest = {
    version,
    builtAt: new Date().toISOString(),
    cardCount: built.cardCount,
    skipped: built.skipped,
    bReady: true,
    a: { version, url: pubA.publicUrl, size: built.indexA.length },
    b: { version, url: pubB.publicUrl, size: built.indexB.length },
  };

  const { error: upM } = await admin.storage.from(bucket).upload("manifest.json", JSON.stringify(manifest), {
    contentType: "application/json",
    upsert: true,
  });
  if (upM) throw new Error(upM.message);

  const { data: pubM } = admin.storage.from(bucket).getPublicUrl("manifest.json");
  console.log(JSON.stringify({ ok: true, manifestUrl: pubM.publicUrl, cardCount: built.cardCount }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
