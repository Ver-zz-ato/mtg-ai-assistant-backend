import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";

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
      watchlist: [],
      price_snapshots: [],
    };

    // Get profile
    const { data: profile } = await admin
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .maybeSingle();
    exportData.profile = profile;

    // Get decks
    const { data: decks } = await admin
      .from('decks')
      .select('*')
      .eq('user_id', targetUserId);
    exportData.decks = decks || [];

    // Get deck cards
    if (exportData.decks.length > 0) {
      const deckIds = exportData.decks.map((d: any) => d.id);
      const { data: deckCards } = await admin
        .from('deck_cards')
        .select('*')
        .in('deck_id', deckIds);
      exportData.deck_cards = deckCards || [];
    }

    // Get collections
    const { data: collections } = await admin
      .from('collections')
      .select('*')
      .eq('user_id', targetUserId);
    exportData.collections = collections || [];

    // Get collection cards
    if (exportData.collections.length > 0) {
      const collectionIds = exportData.collections.map((c: any) => c.id);
      const { data: collectionCards } = await admin
        .from('collection_cards')
        .select('*')
        .in('collection_id', collectionIds);
      exportData.collection_cards = collectionCards || [];
    }

    // Get chat threads
    const { data: threads } = await admin
      .from('chat_threads')
      .select('*')
      .eq('user_id', targetUserId);
    exportData.chat_threads = threads || [];

    // Get chat messages
    if (exportData.chat_threads.length > 0) {
      const threadIds = exportData.chat_threads.map((t: any) => t.id);
      const { data: messages } = await admin
        .from('chat_messages')
        .select('*')
        .in('thread_id', threadIds);
      exportData.chat_messages = messages || [];
    }

    // Get wishlists
    const { data: wishlists } = await admin
      .from('wishlists')
      .select('*')
      .eq('user_id', targetUserId);
    exportData.wishlists = wishlists || [];

    // Get wishlist items
    if (exportData.wishlists.length > 0) {
      const wishlistIds = exportData.wishlists.map((w: any) => w.id);
      const { data: wishlistItems } = await admin
        .from('wishlist_items')
        .select('*')
        .in('wishlist_id', wishlistIds);
      exportData.wishlist_items = wishlistItems || [];
    }

    // Get watchlist
    const { data: watchlist } = await admin
      .from('watchlist')
      .select('*')
      .eq('user_id', targetUserId);
    exportData.watchlist = watchlist || [];

    // Get price snapshots (if table exists)
    try {
      const { data: snapshots } = await admin
        .from('price_snapshots')
        .select('*')
        .eq('user_id', targetUserId)
        .limit(1000); // Limit to recent snapshots
      exportData.price_snapshots = snapshots || [];
    } catch (e) {
      // Table might not exist, skip
      exportData.price_snapshots = [];
    }

    // Log to audit
    try {
      await admin.from('admin_audit').insert({
        actor_id: user.id,
        action: 'gdpr_export',
        target: targetUserId,
        details: `GDPR data export generated`
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

