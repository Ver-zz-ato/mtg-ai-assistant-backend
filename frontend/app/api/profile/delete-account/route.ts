import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetchAllRows";

export const runtime = "nodejs";

function hasEmailPasswordIdentity(user: { identities?: { provider: string }[] } | null): boolean {
  return (user?.identities ?? []).some((i) => i.provider === "email");
}

/**
 * POST /api/profile/delete-account
 * Self-service account deletion. Requires authenticated user (session cookie or Bearer token).
 * Email/password users must send `{ "password": "..." }`; verified via anon `signInWithPassword` before delete.
 * OAuth-only users (no `email` identity): deletion allowed with session only (no password on file).
 * Deletes all user data then auth user (service role required).
 */
export async function POST(req: Request) {
  try {
    let supabase = await getServerSupabase();
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        supabase = createClientWithBearerToken(bearerToken);
        ({
          data: { user },
        } = await supabase.auth.getUser());
      }
    }

    if (!user?.email) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: { password?: string } = {};
    try {
      const ct = req.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        body = await req.json();
      }
    } catch {
      body = {};
    }

    if (hasEmailPasswordIdentity(user)) {
      const pwd = typeof body.password === "string" ? body.password : "";
      if (!pwd.trim()) {
        return NextResponse.json(
          { ok: false, error: "Enter your account password to delete your account." },
          { status: 400 },
        );
      }
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anon) {
        return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
      }
      const verifyClient = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: pwErr } = await verifyClient.auth.signInWithPassword({
        email: user.email,
        password: pwd,
      });
      if (pwErr) {
        return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 401 });
      }
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
    const deckRows = await fetchAllSupabaseRows<{ id: string }>(() =>
      admin.from("decks").select("id").eq("user_id", targetUserId).order("id", { ascending: true }),
    );
    const deckIds = deckRows.map((d) => d.id);
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
    const collectionRows = await fetchAllSupabaseRows<{ id: string }>(() =>
      admin.from("collections").select("id").eq("user_id", targetUserId).order("id", { ascending: true }),
    );
    const collectionIds = collectionRows.map((c) => c.id);
    if (collectionIds.length > 0) {
      await admin.from("collection_cards").delete().in("collection_id", collectionIds);
    }

    // 4. Collections
    await admin.from("collections").delete().eq("user_id", targetUserId);

    // 5. Chat messages
    const threadRows = await fetchAllSupabaseRows<{ id: string }>(() =>
      admin.from("chat_threads").select("id").eq("user_id", targetUserId).order("id", { ascending: true }),
    );
    const threadIds = threadRows.map((t) => t.id);
    if (threadIds.length > 0) {
      await admin.from("chat_messages").delete().in("thread_id", threadIds);
    }

    // 6. Chat threads
    await admin.from("chat_threads").delete().eq("user_id", targetUserId);

    // 7. Wishlist items
    const wishlistRows = await fetchAllSupabaseRows<{ id: string }>(() =>
      admin.from("wishlists").select("id").eq("user_id", targetUserId).order("id", { ascending: true }),
    );
    const wishlistIds = wishlistRows.map((w) => w.id);
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
