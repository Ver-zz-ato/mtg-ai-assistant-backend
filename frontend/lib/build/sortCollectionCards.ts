import type { CollectionCardBucket } from "./collectionCardBucket";

export type CollectionSortMode = "price" | "name";

export type SortableCollectionRow = {
  name: string;
  qty: number;
  priceUsd?: number;
  color_identity?: string[] | null;
};

export function sortCollectionCards(
  rows: SortableCollectionRow[],
  mode: CollectionSortMode,
): SortableCollectionRow[] {
  const copy = [...rows];
  if (mode === "price") {
    copy.sort((a, b) => (b.priceUsd ?? 0) - (a.priceUsd ?? 0) || a.name.localeCompare(b.name));
  } else {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  }
  return copy;
}

export const COLLECTION_BUCKET_LABELS: Record<CollectionCardBucket, string> = {
  lands: "Lands",
  creatures: "Creatures",
  spells: "Spells",
  other: "Other",
};
