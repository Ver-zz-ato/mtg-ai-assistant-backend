import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FREE_COLLECTION_CARD_LIMIT,
  FREE_COLLECTION_LIMIT,
  FREE_DECK_LIMIT,
  FREE_WISHLIST_CARD_LIMIT,
  FREE_WISHLIST_LIMIT,
  buildProStorageLimitError,
  exceedsFreeCountLimit,
  exceedsFreeSizeLimit,
  type ProStorageLimitError,
} from "@/lib/pro-storage-limits";

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
