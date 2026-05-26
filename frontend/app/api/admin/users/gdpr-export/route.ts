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
    if (!targetUserId) {
      return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
    }

    // Get user auth data
    const { data: userData, error: getUserError } = await admin.auth.admin.getUserById(targetUserId);
    if (getUserError || !userData?.user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    // Collect all user data
    const exportData: any = {
      export_date: new Date().toISOString(),
      user_id: targetUserId,
      auth: {
        email: userData.user.email,
        email_confirmed_at: userData.user.email_confirmed_at,
        created_at: userData.user.created_at,
        last_sign_in_at: userData.user.last_sign_in_at,
        user_metadata: userData.user.user_metadata,
      },
      profile: null,
      decks: [],
      collections: [],
      chat_threads: [],
      chat_messages: [],
      wishlists: [],
      watchlists: [],
      watchlist_items: [],
    };

    // Get profile
    const { data: profile } = await admin
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .maybeSingle();
    exportData.profile = profile;

    // Get decks
    const decks = await fetchAllSupabaseRows<Record<string, unknown>>(() =>
      admin.from("decks").select("*").eq("user_id", targetUserId).order("id", { ascending: true }),
    );
    exportData.decks = decks;

    // Get deck cards
    if (exportData.decks.length > 0) {
      const deckIds = exportData.decks.map((d: any) => d.id);
      exportData.deck_cards = await fetchAllSupabaseRows<Record<string, unknown>>(() =>
        admin.from("deck_cards").select("*").in("deck_id", deckIds).order("id", { ascending: true }),
      );
    }

    // Get collections
    const collections = await fetchAllSupabaseRows<Record<string, unknown>>(() =>
      admin.from("collections").select("*").eq("user_id", targetUserId).order("id", { ascending: true }),
    );
    exportData.collections = collections;

    // Get collection cards
    if (exportData.collections.length > 0) {
      const collectionIds = exportData.collections.map((c: any) => c.id);
      exportData.collection_cards = await fetchAllSupabaseRows<Record<string, unknown>>(() =>
        admin
          .from("collection_cards")
          .select("*")
          .in("collection_id", collectionIds)
          .order("id", { ascending: true }),
      );
    }

    // Get chat threads
    const threads = await fetchAllSupabaseRows<Record<string, unknown>>(() =>
      admin.from("chat_threads").select("*").eq("user_id", targetUserId).order("id", { ascending: true }),
    );
    exportData.chat_threads = threads;

    // Get chat messages
    if (exportData.chat_threads.length > 0) {
      const threadIds = exportData.chat_threads.map((t: any) => t.id);
      exportData.chat_messages = await fetchAllSupabaseRows<Record<string, unknown>>(() =>
        admin.from("chat_messages").select("*").in("thread_id", threadIds).order("id", { ascending: true }),
      );
    }

    // Get wishlists
    const wishlists = await fetchAllSupabaseRows<Record<string, unknown>>(() =>
      admin.from("wishlists").select("*").eq("user_id", targetUserId).order("id", { ascending: true }),
    );
    exportData.wishlists = wishlists;

    // Get wishlist items
    if (exportData.wishlists.length > 0) {
      const wishlistIds = exportData.wishlists.map((w: any) => w.id);
      exportData.wishlist_items = await fetchAllSupabaseRows<Record<string, unknown>>(() =>
        admin
          .from("wishlist_items")
          .select("*")
          .in("wishlist_id", wishlistIds)
          .order("id", { ascending: true }),
      );
    }

    // Get watchlists
    const watchlists = await fetchAllSupabaseRows<Record<string, unknown>>(() =>
      admin.from("watchlists").select("*").eq("user_id", targetUserId).order("id", { ascending: true }),
    );
    exportData.watchlists = watchlists;

    if (exportData.watchlists.length > 0) {
      const watchlistIds = exportData.watchlists.map((w: any) => w.id);
      exportData.watchlist_items = await fetchAllSupabaseRows<Record<string, unknown>>(() =>
        admin
          .from("watchlist_items")
          .select("*")
          .in("watchlist_id", watchlistIds)
          .order("id", { ascending: true }),
      );
    }

    // Log to audit
    try {
      await admin.from('admin_audit').insert({
        actor_id: user.id,
        action: 'gdpr_export',
        target: targetUserId,
        payload: { changed_by: user.email || user.id }
      });
    } catch (auditError) {
      console.warn('Audit log failed:', auditError);
    }

    // Return JSON (client will trigger download)
    return NextResponse.json({
      ok: true,
      data: exportData,
      filename: `gdpr-export-${targetUserId}-${Date.now()}.json`
    });
  } catch (e: any) {
    console.error('GDPR export error:', e);
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

