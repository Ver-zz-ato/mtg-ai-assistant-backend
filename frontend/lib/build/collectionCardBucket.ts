/**
 * Bucket collection cards for manual deck builder tabs.
 */

export type CollectionCardBucket = "lands" | "creatures" | "spells" | "other";

export type CardBucketMeta = {
  type_line?: string | null;
  is_land?: boolean | null;
  is_creature?: boolean | null;
  is_instant?: boolean | null;
  is_sorcery?: boolean | null;
  is_enchantment?: boolean | null;
  is_artifact?: boolean | null;
  is_planeswalker?: boolean | null;
};

export function getCollectionCardBucket(meta: CardBucketMeta | undefined): CollectionCardBucket {
  if (!meta) return "other";
  if (meta.is_land === true) return "lands";
  const tl = String(meta.type_line || "").toLowerCase();
  if (meta.is_land === false ? false : tl.includes("land")) return "lands";
  if (meta.is_creature === true || tl.includes("creature")) return "creatures";
  if (
    meta.is_instant === true ||
    meta.is_sorcery === true ||
    meta.is_enchantment === true ||
    tl.includes("instant") ||
    tl.includes("sorcery") ||
    tl.includes("enchantment")
  ) {
    return "spells";
  }
  return "other";
}
