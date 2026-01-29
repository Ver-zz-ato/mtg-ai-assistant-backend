import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";

/**
 * POST /api/profile/delete-account
 * Self-service account deletion. Requires authenticated user.
 * Deletes all user data then auth user (service role required).
 */
export async function POST() {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json(
        { ok: false, error: "Account deletion is temporarily unavailable. Please contact support." },
        { status: 500 }
      );
    }

    const targetUserId = user.id;

    // Delete all user data (order matters due to foreign keys)
    // 1. Deck cards
    const { data: decks } = await admin.from("decks").select("id").eq("user_id", targetUserId);
    const deckIds = (decks ?? []).map((d: { id: string }) => d.id);
    if (deckIds.length > 0) {
      await admin.from("deck_cards").delete().in("deck_id", deckIds);
      try {
        await admin.from("deck_likes").delete().in("deck_id", deckIds);
      } catch {
        // Table may not exist or different schema
      }
    }

    // 2. Decks
    await admin.from("decks").delete().eq("user_id", targetUserId);

    // 3. Collection cards
    const { data: collections } = await admin.from("collections").select("id").eq("user_id", targetUserId);
    const collectionIds = (collections ?? []).map((c: { id: string }) => c.id);
    if (collectionIds.length > 0) {
      await admin.from("collection_cards").delete().in("collection_id", collectionIds);
    }

    // 4. Collections
    await admin.from("collections").delete().eq("user_id", targetUserId);

    // 5. Chat messages
    const { data: threads } = await admin.from("chat_threads").select("id").eq("user_id", targetUserId);
    const threadIds = (threads ?? []).map((t: { id: string }) => t.id);
    if (threadIds.length > 0) {
      await admin.from("chat_messages").delete().in("thread_id", threadIds);
    }

    // 6. Chat threads
    await admin.from("chat_threads").delete().eq("user_id", targetUserId);

    // 7. Wishlist items
    const { data: wishlists } = await admin.from("wishlists").select("id").eq("user_id", targetUserId);
    const wishlistIds = (wishlists ?? []).map((w: { id: string }) => w.id);
    if (wishlistIds.length > 0) {
      await admin.from("wishlist_items").delete().in("wishlist_id", wishlistIds);
    }

    // 8. Wishlists
    await admin.from("wishlists").delete().eq("user_id", targetUserId);

    // 9. Watchlist
    await admin.from("watchlist").delete().eq("user_id", targetUserId);

    // 9b. Likes audit (user-scoped)
    try {
      await admin.from("likes_audit").delete().eq("user_id", targetUserId);
    } catch {
      // Table may not exist
    }

    // 10. Price snapshots (if user-scoped)
    try {
      await admin.from("price_snapshots").delete().eq("user_id", targetUserId);
    } catch {
      // Table may not have user_id
    }

    // 11. User-scoped tables
    try {
      await admin.from("user_ai_examples").delete().eq("user_id", targetUserId);
    } catch {
      // Table may not exist
    }
    try {
      await admin.from("user_prompt_variant").delete().eq("user_id", targetUserId);
    } catch {
      // Table may not exist
    }

    // 12. Profile
    await admin.from("profiles").delete().eq("id", targetUserId);

    // 13. Public profile
    try {
      await admin.from("profiles_public").delete().eq("id", targetUserId);
    } catch {
      // Table may not exist
    }

    // 14. Auth user
    try {
      await admin.auth.admin.deleteUser(targetUserId);
    } catch (e: unknown) {
      console.error("Delete account: auth delete failed", e);
      return NextResponse.json(
        { ok: false, error: "Could not delete authentication account. Data was removed. Please contact support." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: "Account deleted" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    console.error("Delete account error:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
