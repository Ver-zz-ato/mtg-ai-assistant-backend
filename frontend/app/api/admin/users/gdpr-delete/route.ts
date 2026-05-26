import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { fetchAllSupabaseRows } from "@/lib/supabase/fetchAllRows";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  try {
    const { validateOrigin } = await import('@/lib/api/csrf');
    if (!validateOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid origin. This request must come from the same site.' },
        { status: 403 }
      );
    }

    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body?.userId || "");
    const confirmDelete = String(body?.confirm || "");
    
    if (!targetUserId) {
      return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
    }

    if (confirmDelete !== 'DELETE') {
      return NextResponse.json({ ok: false, error: "Must confirm with 'DELETE'" }, { status: 400 });
    }

    // Prevent self-deletion
    if (targetUserId === user.id) {
      return NextResponse.json({ ok: false, error: "Cannot delete your own account via admin panel" }, { status: 400 });
    }

    // Get user info for logging
    const { data: targetUserData } = await admin.auth.admin.getUserById(targetUserId);
    const targetEmail = targetUserData?.user?.email || 'unknown';

    // Delete all user data (order matters due to foreign keys)
    
    // 1. Delete deck cards first (FK constraint)
    const decks = await fetchAllSupabaseRows<{ id: string }>(() =>
      admin.from("decks").select("id").eq("user_id", targetUserId).order("id", { ascending: true }),
    );
    const deckIds = decks.map((d) => d.id);
    
    if (deckIds.length > 0) {
      await admin.from('deck_cards').delete().in('deck_id', deckIds);
    }

    // 2. Delete decks
    await admin.from('decks').delete().eq('user_id', targetUserId);

    // 3. Delete collection cards first
    const collections = await fetchAllSupabaseRows<{ id: string }>(() =>
      admin.from("collections").select("id").eq("user_id", targetUserId).order("id", { ascending: true }),
    );
    const collectionIds = collections.map((c) => c.id);
    
    if (collectionIds.length > 0) {
      await admin.from('collection_cards').delete().in('collection_id', collectionIds);
    }

    // 4. Delete collections
    await admin.from('collections').delete().eq('user_id', targetUserId);

    // 5. Delete chat messages first
    const threads = await fetchAllSupabaseRows<{ id: string }>(() =>
      admin.from("chat_threads").select("id").eq("user_id", targetUserId).order("id", { ascending: true }),
    );
    const threadIds = threads.map((t) => t.id);
    
    if (threadIds.length > 0) {
      await admin.from('chat_messages').delete().in('thread_id', threadIds);
    }

    // 6. Delete chat threads
    await admin.from('chat_threads').delete().eq('user_id', targetUserId);

    // 7. Delete wishlist items first
    const wishlists = await fetchAllSupabaseRows<{ id: string }>(() =>
      admin.from("wishlists").select("id").eq("user_id", targetUserId).order("id", { ascending: true }),
    );
    const wishlistIds = wishlists.map((w) => w.id);
    
    if (wishlistIds.length > 0) {
      await admin.from('wishlist_items').delete().in('wishlist_id', wishlistIds);
    }

    // 8. Delete wishlists
    await admin.from('wishlists').delete().eq('user_id', targetUserId);

    // 9. Delete watchlist items and watchlists
    const watchlists = await fetchAllSupabaseRows<{ id: string }>(() =>
      admin.from("watchlists").select("id").eq("user_id", targetUserId).order("id", { ascending: true }),
    );
    const watchlistIds = watchlists.map((w) => w.id);
    if (watchlistIds.length > 0) {
      await admin.from('watchlist_items').delete().in('watchlist_id', watchlistIds);
    }
    await admin.from('watchlists').delete().eq('user_id', targetUserId);

    // 10. Delete profile
    await admin.from('profiles').delete().eq('id', targetUserId);

    // 11. Delete public profile if exists
    try {
      await admin.from('profiles_public').delete().eq('id', targetUserId);
    } catch (e) {
      // Table might not exist, continue
    }

    // 12. Delete auth user (this should cascade to some tables)
    try {
      await admin.auth.admin.deleteUser(targetUserId);
    } catch (e: any) {
      console.error('Failed to delete auth user:', e);
      // Continue even if auth deletion fails (may already be deleted)
    }

    // Log to audit
    try {
      await admin.from('admin_audit').insert({
        actor_id: user.id,
        action: 'gdpr_delete',
        target: targetUserId,
        payload: { email: targetEmail, changed_by: user.email || user.id }
      });
    } catch (auditError) {
      console.warn('Audit log failed:', auditError);
    }

    return NextResponse.json({ 
      ok: true, 
      message: `Account and all data deleted for user ${targetEmail}`,
      userId: targetUserId
    });
  } catch (e: any) {
    console.error('GDPR delete error:', e);
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

