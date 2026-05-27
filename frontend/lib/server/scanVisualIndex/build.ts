import sharp from "sharp";
import { computeDhash64, type Dhash64, type RgbaImage } from "./dhash";
import { computeGridEmbeddingInt8, GRID_EMBED_DIM } from "./grid-embed";
import { encodeAIndex, encodeBIndex } from "./encode";
import {
  getScanVisualIndexImageSource,
  scryfallCacheImageColumn,
  type ScanVisualIndexImageSource,
} from "./image-source";

export type { ScanVisualIndexImageSource };

export type ScryfallCacheVisualRow = {
  name: string;
  image_url: string | null;
};

/** @deprecated Use ScryfallCacheVisualRow */
export type ScryfallCacheArtRow = ScryfallCacheVisualRow;

const FETCH_BATCH = 24;
const PAGE_SIZE = 500;

async function fetchImageRgba(url: string): Promise<RgbaImage | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const { data, info } = await sharp(buf)
      .resize(288, 288, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      width: info.width,
      height: info.height,
      data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    };
  } catch {
    return null;
  }
}

export type BuildVisualIndexProgress = {
  processed: number;
  total: number;
  skipped: number;
  batchIndex: number;
  batchMs: number;
  indexed: number;
};

export type BuildVisualIndexLog = {
  info: (msg: string, extra?: Record<string, unknown>) => void;
  warn: (msg: string, extra?: Record<string, unknown>) => void;
};

export async function buildVisualIndexArtifacts(
  rows: ScryfallCacheVisualRow[],
  onProgress?: (p: BuildVisualIndexProgress) => void,
  log?: BuildVisualIndexLog,
): Promise<{ indexA: Buffer; indexB: Buffer; cardCount: number; skipped: number }> {
  const names: string[] = [];
  const hashes: Dhash64[] = [];
  const vectors: Int8Array[] = [];
  let skipped = 0;
  const total = rows.length;
  const started = Date.now();
  log?.info("build_start", { total, fetchBatch: FETCH_BATCH });

  for (let i = 0; i < rows.length; i += FETCH_BATCH) {
    const batchStarted = Date.now();
    const batchIndex = Math.floor(i / FETCH_BATCH) + 1;
    const batch = rows.slice(i, i + FETCH_BATCH);
    const results = await Promise.all(
      batch.map(async (row) => {
        const url = row.image_url?.trim();
        const name = row.name?.trim();
        if (!url || !name) return { ok: false as const, reason: "missing_url_or_name", name: name ?? "" };
        const rgba = await fetchImageRgba(url);
        if (!rgba) return { ok: false as const, reason: "fetch_or_decode_failed", name };
        return {
          ok: true as const,
          name,
          hash: computeDhash64(rgba),
          vector: computeGridEmbeddingInt8(rgba),
        };
      }),
    );
    for (const item of results) {
      if (!item.ok) {
        skipped += 1;
        if (skipped <= 20 || skipped % 500 === 0) {
          log?.warn("row_skipped", { reason: item.reason, name: item.name });
        }
        continue;
      }
      names.push(item.name);
      hashes.push(item.hash);
      vectors.push(item.vector);
    }
    const batchMs = Date.now() - batchStarted;
    const processed = Math.min(i + FETCH_BATCH, total);
    onProgress?.({
      processed,
      total,
      skipped,
      batchIndex,
      batchMs,
      indexed: names.length,
    });
    if (batchIndex === 1 || batchIndex % 25 === 0 || processed === total) {
      const elapsed = Date.now() - started;
      const rate = processed > 0 ? (processed / elapsed) * 1000 : 0;
      const etaSec = rate > 0 ? Math.round((total - processed) / rate) : 0;
      log?.info("batch_progress", {
        batchIndex,
        processed,
        total,
        indexed: names.length,
        skipped,
        batchMs,
        elapsedSec: Math.round(elapsed / 1000),
        etaSec,
      });
    }
  }

  log?.info("encode_start", { indexed: names.length });
  const encodeStart = Date.now();
  const indexA = encodeAIndex(names, hashes);
  const indexB = encodeBIndex(names, vectors, GRID_EMBED_DIM);
  log?.info("encode_done", {
    indexABytes: indexA.length,
    indexBBytes: indexB.length,
    encodeMs: Date.now() - encodeStart,
    totalMs: Date.now() - started,
  });

  return {
    indexA,
    indexB,
    cardCount: names.length,
    skipped,
  };
}

export async function fetchScryfallCacheVisualRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  log?: BuildVisualIndexLog,
  imageSource: ScanVisualIndexImageSource = getScanVisualIndexImageSource(),
): Promise<ScryfallCacheVisualRow[]> {
  const column = scryfallCacheImageColumn(imageSource);
  const rows: ScryfallCacheVisualRow[] = [];
  let from = 0;
  let pageNum = 0;
  log?.info("fetch_config", { imageSource, column });
  while (true) {
    const { data, error } = await supabase
      .from("scryfall_cache")
      .select(`name, ${column}`)
      .not(column, "is", null)
      .order("name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      log?.warn("fetch_page_error", { from, message: String(error?.message ?? error) });
      break;
    }
    const page = (data ?? []) as Array<{ name: string } & Record<string, string | null>>;
    if (!page.length) break;
    const kept: ScryfallCacheVisualRow[] = [];
    for (const r of page) {
      const url = r[column]?.trim();
      if (url && r.name) kept.push({ name: r.name, image_url: url });
    }
    rows.push(...kept);
    pageNum += 1;
    if (pageNum === 1 || pageNum % 10 === 0) {
      log?.info("fetch_page", { pageNum, from, pageRows: page.length, totalRows: rows.length });
    }
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  log?.info("fetch_complete", { totalRows: rows.length, pages: pageNum, imageSource, column });
  return rows;
}

/** @deprecated Use fetchScryfallCacheVisualRows */
export async function fetchScryfallCacheArtRows(
  supabase: Parameters<typeof fetchScryfallCacheVisualRows>[0],
  log?: BuildVisualIndexLog,
): Promise<ScryfallCacheVisualRow[]> {
  return fetchScryfallCacheVisualRows(supabase, log, "art_crop");
}
