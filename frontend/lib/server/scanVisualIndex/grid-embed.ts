import type { RgbaImage } from "./dhash";
import { resizeRgba } from "./dhash";

const GRID = 16;

export const GRID_EMBED_DIM = GRID * GRID * 3;

export function computeGridEmbeddingInt8(image: RgbaImage): Int8Array {
  const small = resizeRgba(image, GRID, GRID);
  const out = new Int8Array(GRID_EMBED_DIM);
  let o = 0;
  for (let i = 0; i < small.data.length; i += 4) {
    out[o++] = Math.max(-128, Math.min(127, small.data[i] - 128));
    out[o++] = Math.max(-128, Math.min(127, small.data[i + 1] - 128));
    out[o++] = Math.max(-128, Math.min(127, small.data[i + 2] - 128));
  }
  return out;
}
