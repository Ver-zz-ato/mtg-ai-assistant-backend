import type { SupabaseClient } from "@supabase/supabase-js";

export const FREE_DECK_LIMIT = 15;
export const FREE_COLLECTION_LIMIT = 10;
export const FREE_COLLECTION_CARD_LIMIT = 500;
export const FREE_WISHLIST_LIMIT = 10;
export const FREE_WISHLIST_CARD_LIMIT = 100;

export type ProStorageLimitCode =
  | "PRO_LIMIT_DECKS"
  | "PRO_LIMIT_COLLECTIONS"
  | "PRO_LIMIT_COLLECTION_SIZE"
  | "PRO_LIMIT_WISHLISTS"
  | "PRO_LIMIT_WISHLIST_SIZE";

export type ProStorageLimitError = {
  code: ProStorageLimitCode;
  message: string;
  limit: number;
};

export const PRO_STORAGE_LIMIT_MESSAGES: Record<ProStorageLimitCode, string> = {
  PRO_LIMIT_DECKS: "Free accounts can save up to 15 decks. Upgrade to Pro for unlimited decks.",
  PRO_LIMIT_COLLECTIONS: "Free accounts can save up to 10 collections. Upgrade to Pro for unlimited collections.",
  PRO_LIMIT_COLLECTION_SIZE:
    "Free collections can hold up to 500 cards. Upgrade to Pro for unlimited collection size.",
  PRO_LIMIT_WISHLISTS: "Free accounts can save up to 10 wishlists. Upgrade to Pro for unlimited wishlists.",
  PRO_LIMIT_WISHLIST_SIZE:
    "Free wishlists can hold up to 100 cards. Upgrade to Pro for unlimited wishlist size.",
};

export function buildProStorageLimitError(
  code: ProStorageLimitCode,
  limit = getLimitForCode(code),
): ProStorageLimitError {
  return { code, message: PRO_STORAGE_LIMIT_MESSAGES[code], limit };
}

function getLimitForCode(code: ProStorageLimitCode): number {
  switch (code) {
    case "PRO_LIMIT_DECKS":
      return FREE_DECK_LIMIT;
    case "PRO_LIMIT_COLLECTIONS":
      return FREE_COLLECTION_LIMIT;
    case "PRO_LIMIT_COLLECTION_SIZE":
      return FREE_COLLECTION_CARD_LIMIT;
    case "PRO_LIMIT_WISHLISTS":
      return FREE_WISHLIST_LIMIT;
    case "PRO_LIMIT_WISHLIST_SIZE":
      return FREE_WISHLIST_CARD_LIMIT;
  }
}

export function exceedsFreeCountLimit(currentCount: number, creatingCount: number, limit: number): boolean {
  return Math.max(0, currentCount) + Math.max(0, creatingCount) > limit;
}

export function exceedsFreeSizeLimit(currentQty: number, addedQty: number, limit: number): boolean {
  return Math.max(0, currentQty) + Math.max(0, addedQty) > limit;
}

export async function getEffectiveProStatus(userId: string): Promise<boolean> {
  const { checkProStatus } = await import("@/lib/server-pro-check");
  return checkProStatus(userId);
}

async function countRows(
  supabase: SupabaseClient,
  table: "decks" | "collections" | "wishlists",
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function assertCanCreateDecks(
  supabase: SupabaseClient,
  userId: string,
  creatingCount = 1,
): Promise<ProStorageLimitError | null> {
  if (await getEffectiveProStatus(userId)) return null;
  const current = await countRows(supabase, "decks", userId);
  return exceedsFreeCountLimit(current, creatingCount, FREE_DECK_LIMIT)
    ? buildProStorageLimitError("PRO_LIMIT_DECKS")
    : null;
}

export async function assertCanCreateCollections(
  supabase: SupabaseClient,
  userId: string,
  creatingCount = 1,
): Promise<ProStorageLimitError | null> {
  if (await getEffectiveProStatus(userId)) return null;
  const current = await countRows(supabase, "collections", userId);
  return exceedsFreeCountLimit(current, creatingCount, FREE_COLLECTION_LIMIT)
    ? buildProStorageLimitError("PRO_LIMIT_COLLECTIONS")
    : null;
}

export async function assertCanCreateWishlists(
  supabase: SupabaseClient,
  userId: string,
  creatingCount = 1,
): Promise<ProStorageLimitError | null> {
  if (await getEffectiveProStatus(userId)) return null;
  const current = await countRows(supabase, "wishlists", userId);
  return exceedsFreeCountLimit(current, creatingCount, FREE_WISHLIST_LIMIT)
    ? buildProStorageLimitError("PRO_LIMIT_WISHLISTS")
    : null;
}

export async function getCollectionTotalQty(
  supabase: SupabaseClient,
  collectionId: string,
): Promise<number> {
  const { data, error } = await supabase.from("collection_cards").select("qty").eq("collection_id", collectionId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row: { qty: unknown }) => sum + Math.max(0, Number(row.qty) || 0), 0);
}

export async function getWishlistTotalQty(
  supabase: SupabaseClient,
  wishlistId: string,
): Promise<number> {
  const { data, error } = await supabase.from("wishlist_items").select("qty").eq("wishlist_id", wishlistId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row: { qty: unknown }) => sum + Math.max(0, Number(row.qty) || 0), 0);
}

export async function assertCanGrowCollection(
  supabase: SupabaseClient,
  userId: string,
  collectionId: string,
  addedQty: number,
): Promise<ProStorageLimitError | null> {
  if (addedQty <= 0 || (await getEffectiveProStatus(userId))) return null;
  const current = await getCollectionTotalQty(supabase, collectionId);
  return exceedsFreeSizeLimit(current, addedQty, FREE_COLLECTION_CARD_LIMIT)
    ? buildProStorageLimitError("PRO_LIMIT_COLLECTION_SIZE")
    : null;
}

export async function assertCanGrowWishlist(
  supabase: SupabaseClient,
  userId: string,
  wishlistId: string,
  addedQty: number,
): Promise<ProStorageLimitError | null> {
  if (addedQty <= 0 || (await getEffectiveProStatus(userId))) return null;
  const current = await getWishlistTotalQty(supabase, wishlistId);
  return exceedsFreeSizeLimit(current, addedQty, FREE_WISHLIST_CARD_LIMIT)
    ? buildProStorageLimitError("PRO_LIMIT_WISHLIST_SIZE")
    : null;
}
