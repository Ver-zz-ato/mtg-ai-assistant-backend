export type ScanVisualIndexImageSource = "art_crop" | "normal";

/** DB column + manifest field for index/query domain. Default `normal` for full-card experiment. */
export function getScanVisualIndexImageSource(): ScanVisualIndexImageSource {
  const v = process.env.SCAN_VISUAL_INDEX_IMAGE_SOURCE?.trim().toLowerCase();
  if (v === "art_crop" || v === "normal") return v;
  return "normal";
}

export function scryfallCacheImageColumn(source: ScanVisualIndexImageSource): "art_crop" | "normal" {
  return source === "normal" ? "normal" : "art_crop";
}
