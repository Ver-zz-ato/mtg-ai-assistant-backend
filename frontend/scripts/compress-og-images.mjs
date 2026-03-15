/**
 * Compress frontend/public/opengraph-image.jpg and twitter-image.jpg
 * Target: 1200×630, <300KB each. Run from frontend/: node scripts/compress-og-images.mjs
 */
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";

const PUBLIC = join(process.cwd(), "public");
const FILES = ["opengraph-image.jpg", "twitter-image.jpg"];
const TARGET_W = 1200;
const TARGET_H = 630;
const MAX_BYTES = 300 * 1024;

async function compressOne(filename) {
  const inputPath = join(PUBLIC, filename);
  const buf = await readFile(inputPath);
  let quality = 82;
  let output;

  while (quality >= 40) {
    output = await sharp(buf)
      .resize(TARGET_W, TARGET_H, { fit: "cover", position: "center" })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (output.length <= MAX_BYTES) break;
    quality -= 8;
  }

  await writeFile(inputPath, output);
  const kb = (output.length / 1024).toFixed(1);
  console.log(`${filename}: ${kb} KB (quality ${quality})`);
}

async function main() {
  for (const f of FILES) {
    await compressOne(f);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
