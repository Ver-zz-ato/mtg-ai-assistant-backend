/**
 * Run scan visual index build locally (uses .env.local service role).
 * Usage:
 *   npx tsx scripts/run-scan-visual-index-once.ts [limit]
 *   limit=0 → all rows (~37k). Logs to logs/scan-visual-index-<ts>.log
 */
import { mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  buildVisualIndexArtifacts,
  fetchScryfallCacheVisualRows,
  type BuildVisualIndexLog,
} from "../lib/server/scanVisualIndex/build";
import { getScanVisualIndexImageSource } from "../lib/server/scanVisualIndex/image-source";

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

function createLogger(logPath: string): BuildVisualIndexLog & { path: string } {
  mkdirSync(resolve(process.cwd(), "logs"), { recursive: true });
  const write = (level: string, msg: string, extra?: Record<string, unknown>) => {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...extra,
    });
    console.log(`[scan-visual-index] ${line}`);
    appendFileSync(logPath, line + "\n", "utf8");
  };
  return {
    path: logPath,
    info: (msg, extra) => write("info", msg, extra),
    warn: (msg, extra) => write("warn", msg, extra),
  };
}

function parseIndexHeader(buf: Buffer, magic: string): { version: number; count: number } | null {
  if (buf.length < 12) return null;
  const m = buf.toString("ascii", 0, 4);
  if (m !== magic) return null;
  return { version: buf.readUInt32LE(4), count: buf.readUInt32LE(8) };
}

async function verifyUpload(
  manifestUrl: string,
  log: BuildVisualIndexLog,
): Promise<void> {
  log.info("verify_start", { manifestUrl });
  const res = await fetch(manifestUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`manifest fetch failed: ${res.status}`);
  }
  const manifest = (await res.json()) as {
    cardCount?: number;
    skipped?: number;
    a?: { url?: string; size?: number };
    b?: { url?: string; size?: number };
    builtAt?: string;
  };
  log.info("verify_manifest", manifest);

  if (!manifest.a?.url || !manifest.b?.url) {
    throw new Error("manifest missing a/b urls");
  }

  const [aRes, bRes] = await Promise.all([fetch(manifest.a.url), fetch(manifest.b.url)]);
  if (!aRes.ok || !bRes.ok) {
    throw new Error(`index download failed a=${aRes.status} b=${bRes.status}`);
  }
  const aBuf = Buffer.from(await aRes.arrayBuffer());
  const bBuf = Buffer.from(await bRes.arrayBuffer());
  const aHead = parseIndexHeader(aBuf, "MTSA");
  const bHead = parseIndexHeader(bBuf, "MTSB");
  const bDim = bBuf.length >= 16 ? bBuf.readUInt32LE(12) : 0;

  log.info("verify_index_a", {
    bytes: aBuf.length,
    magic: aBuf.toString("ascii", 0, 4),
    header: aHead,
    expectedCount: manifest.cardCount,
  });
  log.info("verify_index_b", {
    bytes: bBuf.length,
    magic: bBuf.toString("ascii", 0, 4),
    header: bHead,
    dim: bDim,
    expectedCount: manifest.cardCount,
  });

  if (!aHead || aHead.count !== manifest.cardCount) {
    throw new Error(`index A count mismatch: header=${aHead?.count} manifest=${manifest.cardCount}`);
  }
  if (!bHead || bHead.count !== manifest.cardCount) {
    throw new Error(`index B count mismatch: header=${bHead?.count} manifest=${manifest.cardCount}`);
  }
  if (bDim !== 768) {
    throw new Error(`index B dim expected 768 got ${bDim}`);
  }
  log.info("verify_ok", { cardCount: manifest.cardCount });
}

async function main() {
  const limitArg = process.argv[2];
  const limit = limitArg === undefined || limitArg === "" ? 500 : Number(limitArg);

  loadEnvLocal();
  const logPath = resolve(process.cwd(), "logs", `scan-visual-index-${Date.now()}.log`);
  const log = createLogger(logPath);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    log.warn("missing_env", { hasUrl: !!url, hasKey: !!key });
    process.exit(1);
  }

  const version = Number(process.env.SCAN_VISUAL_INDEX_VERSION || "1");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const imageSource = getScanVisualIndexImageSource();
  log.info("run_start", {
    limit: limit === 0 ? "ALL" : limit,
    version,
    imageSource,
    supabaseHost: new URL(url).host,
  });

  const fetchStart = Date.now();
  let rows = await fetchScryfallCacheVisualRows(admin, log);
  if (limit > 0) {
    rows = rows.slice(0, limit);
    log.info("limit_applied", { limit, rows: rows.length });
  }
  log.info("rows_ready", { count: rows.length, fetchMs: Date.now() - fetchStart });

  const built = await buildVisualIndexArtifacts(
    rows,
    (p) => {
      if (p.processed % 500 === 0 || p.processed === p.total) {
        log.info("progress_tick", p);
      }
    },
    log,
  );

  const bucket = "scan-index";
  const aPath = `v${version}/scan-index-a.bin`;
  const bPath = `v${version}/scan-index-b.bin`;

  log.info("upload_start", { bucket, aPath, bPath, aBytes: built.indexA.length, bBytes: built.indexB.length });

  const { error: upA } = await admin.storage.from(bucket).upload(aPath, built.indexA, {
    contentType: "application/octet-stream",
    upsert: true,
  });
  if (upA) throw new Error(`upload A: ${upA.message}`);

  const { error: upB } = await admin.storage.from(bucket).upload(bPath, built.indexB, {
    contentType: "application/octet-stream",
    upsert: true,
  });
  if (upB) throw new Error(`upload B: ${upB.message}`);

  const { data: pubA } = admin.storage.from(bucket).getPublicUrl(aPath);
  const { data: pubB } = admin.storage.from(bucket).getPublicUrl(bPath);

  const manifest = {
    version,
    builtAt: new Date().toISOString(),
    cardCount: built.cardCount,
    skipped: built.skipped,
    imageSource,
    bReady: true,
    a: { version, url: pubA.publicUrl, size: built.indexA.length },
    b: { version, url: pubB.publicUrl, size: built.indexB.length },
  };

  const { error: upM } = await admin.storage.from(bucket).upload("manifest.json", JSON.stringify(manifest, null, 2), {
    contentType: "application/json",
    upsert: true,
  });
  if (upM) throw new Error(`upload manifest: ${upM.message}`);

  const { data: pubM } = admin.storage.from(bucket).getPublicUrl("manifest.json");
  log.info("upload_done", {
    manifestUrl: pubM.publicUrl,
    cardCount: built.cardCount,
    skipped: built.skipped,
    logFile: logPath,
  });

  await verifyUpload(pubM.publicUrl, log);

  console.log(
    JSON.stringify(
      {
        ok: true,
        manifestUrl: pubM.publicUrl,
        cardCount: built.cardCount,
        skipped: built.skipped,
        logFile: logPath,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[scan-visual-index] FATAL", msg);
  process.exit(1);
});
