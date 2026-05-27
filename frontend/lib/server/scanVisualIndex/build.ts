import sharp from "sharp";
import { computeDhash64, type Dhash64, type RgbaImage } from "./dhash";
import { computeGridEmbeddingInt8, GRID_EMBED_DIM } from "./grid-embed";
import { encodeAIndex, encodeBIndex } from "./encode";

export type ScryfallCacheArtRow = {
  name: string;
  art_crop: string | null;
};

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
};

export async function buildVisualIndexArtifacts(
  rows: ScryfallCacheArtRow[],
  onProgress?: (p: BuildVisualIndexProgress) => void,
): Promise<{ indexA: Buffer; indexB: Buffer; cardCount: number; skipped: number }> {
  const names: string[] = [];
  const hashes: Dhash64[] = [];
  const vectors: Int8Array[] = [];
  let skipped = 0;
  const total = rows.length;

  for (let i = 0; i < rows.length; i += FETCH_BATCH) {
    const batch = rows.slice(i, i + FETCH_BATCH);
    const results = await Promise.all(
      batch.map(async (row) => {
        const url = row.art_crop?.trim();
        const name = row.name?.trim();
        if (!url || !name) return null;
        const rgba = await fetchImageRgba(url);
        if (!rgba) return null;
        return {
          name,
          hash: computeDhash64(rgba),
          vector: computeGridEmbeddingInt8(rgba),
        };
      }),
    );
    for (const item of results) {
      if (!item) {
        skipped += 1;
        continue;
      }
      names.push(item.name);
      hashes.push(item.hash);
      vectors.push(item.vector);
    }
    onProgress?.({ processed: Math.min(i + FETCH_BATCH, total), total, skipped });
  }

  return {
    indexA: encodeAIndex(names, hashes),
    indexB: encodeBIndex(names, vectors, GRID_EMBED_DIM),
    cardCount: names.length,
    skipped,
  };
}

export async function fetchScryfallCacheArtRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<ScryfallCacheArtRow[]> {
  const rows: ScryfallCacheArtRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("scryfall_cache")
      .select("name, art_crop")
      .not("art_crop", "is", null)
      .order("name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) break;
    const page = (data ?? []) as ScryfallCacheArtRow[];
    if (!page.length) break;
    rows.push(...page.filter((r) => r.art_crop && r.name));
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}
