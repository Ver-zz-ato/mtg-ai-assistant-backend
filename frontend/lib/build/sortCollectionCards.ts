import type { CollectionCardBucket } from "./collectionCardBucket";

export type CollectionSortMode = "price" | "name" | "color";

export type SortableCollectionRow = {
  name: string;
  qty: number;
  priceUsd?: number;
  color_identity?: string[] | null;
};

const WUBRG = ["W", "U", "B", "R", "G"] as const;

function colorSortKey(colors: string[] | null | undefined): string {
  if (!colors?.length) return "Z";
  return WUBRG.filter((c) => colors.includes(c)).join("") || "C";
}

export function sortCollectionCards(
  rows: SortableCollectionRow[],
  mode: CollectionSortMode,
): SortableCollectionRow[] {
  const copy = [...rows];
  if (mode === "price") {
    copy.sort((a, b) => (b.priceUsd ?? 0) - (a.priceUsd ?? 0) || a.name.localeCompare(b.name));
  } else if (mode === "color") {
    copy.sort(
      (a, b) =>
        colorSortKey(a.color_identity).localeCompare(colorSortKey(b.color_identity)) ||
        a.name.localeCompare(b.name),
    );
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
