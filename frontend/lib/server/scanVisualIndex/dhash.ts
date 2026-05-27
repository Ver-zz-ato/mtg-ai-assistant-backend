/** Server copy of mobile dHash (keep in sync with Manatap-APP/src/lib/scan/recognition/dhash.ts). */

export type RgbaImage = { width: number; height: number; data: Uint8Array };

const DHASH_WIDTH = 9;
const DHASH_HEIGHT = 8;

function toGrayscale(r: number, g: number, b: number): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

export function resizeRgba(source: RgbaImage, targetWidth: number, targetHeight: number): RgbaImage {
  const out = new Uint8Array(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = ((y + 0.5) / targetHeight) * source.height - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(source.height - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = ((x + 0.5) / targetWidth) * source.width - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(source.width - 1, x0 + 1);
      const fx = sx - x0;
      const i00 = (y0 * source.width + x0) * 4;
      const i10 = (y0 * source.width + x1) * 4;
      const i01 = (y1 * source.width + x0) * 4;
      const i11 = (y1 * source.width + x1) * 4;
      const o = (y * targetWidth + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const top = source.data[i00 + c] * (1 - fx) + source.data[i10 + c] * fx;
        const bottom = source.data[i01 + c] * (1 - fx) + source.data[i11 + c] * fx;
        out[o + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
      out[o + 3] = 255;
    }
  }
  return { width: targetWidth, height: targetHeight, data: out };
}

export function computeDhash64(image: RgbaImage): bigint {
  const small = resizeRgba(image, DHASH_WIDTH, DHASH_HEIGHT);
  const gray: number[] = [];
  for (let y = 0; y < DHASH_HEIGHT; y += 1) {
    for (let x = 0; x < DHASH_WIDTH; x += 1) {
      const i = (y * DHASH_WIDTH + x) * 4;
      gray.push(toGrayscale(small.data[i], small.data[i + 1], small.data[i + 2]));
    }
  }
  let hash = 0n;
  let bit = 0;
  for (let y = 0; y < DHASH_HEIGHT; y += 1) {
    for (let x = 0; x < DHASH_WIDTH - 1; x += 1) {
      const left = gray[y * DHASH_WIDTH + x];
      const right = gray[y * DHASH_WIDTH + x + 1];
      if (left > right) hash |= 1n << BigInt(bit);
      bit += 1;
    }
  }
  return hash;
}
