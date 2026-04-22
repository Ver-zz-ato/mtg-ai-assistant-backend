import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, createClientWithBearerToken } from "@/lib/server-supabase";
import { captureServer } from "@/lib/server/analytics";
import { sameOriginOrBearerPresent } from "@/lib/api/csrf";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!sameOriginOrBearerPresent(req)) {
      return NextResponse.json({ ok: false, error: "bad_origin" }, { status: 403 });
    }

    let supabase = await getServerSupabase();
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        supabase = createClientWithBearerToken(bearerToken);
        ({
          data: { user },
        } = await supabase.auth.getUser());
      }
    }

    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(()=>({}));
    const is_public = body?.is_public !== false; // default true

    // upsert row in profiles_public from user metadata + computed stats
    const md: any = user.user_metadata || {};
    let profileUsername: string | null = typeof md.username === "string" && md.username.trim() ? md.username.trim() : null;
    if (!profileUsername) {
      try {
        const { data: pr } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
        const u = pr?.username;
        if (typeof u === "string" && u.trim()) profileUsername = u.trim();
      } catch {}
    }

    // counts
    let deck_count = 0, collection_count = 0, messages_30d = 0;
    try {
      const { count: dc } = await supabase.from('decks').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
      deck_count = dc || 0;
    } catch {}
    try {
      const { count: cc } = await supabase.from('collections').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
      collection_count = cc || 0;
    } catch {}
    try {
      const cutoff = new Date(Date.now() - 30*24*60*60*1000).toISOString();
      const { count: mc } = await supabase.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', cutoff);
      messages_30d = mc || 0;
    } catch {}

    // simple badges
    const badges: string[] = [];
    if (deck_count >= 1) badges.push('First Deck');
    if (deck_count >= 5) badges.push('Brewer');
    if (deck_count >= 10) badges.push('Master Builder');
    if (collection_count >= 3) badges.push('Collector');
    if (messages_30d >= 50) badges.push('Chatterbox');

    const row = {
      id: user.id,
      username: profileUsername,
      display_name: profileUsername || (user.email || null),
      avatar: md.avatar || null,
      colors: Array.isArray(md.profile_colors) ? md.profile_colors : null,
      favorite_formats: Array.isArray(md.favorite_formats) ? md.favorite_formats : null,
      favorite_commander: md.favorite_commander || null,
      signature_deck_id: md.signature_deck_id || null,
      is_public,
      deck_count,
      collection_count,
      messages_30d,
      badges,
    } as any;

    const { error } = await supabase.from('profiles_public').upsert(row, { onConflict: 'id' });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    try { await captureServer('profile_share', { user_id: user.id, is_public }); } catch {}

    // Use production domain or explicit base URL (never use preview URLs for sharing)
    const slug = profileUsername || user.id;
    let base: string;
    
    if (process.env.NODE_ENV === 'production') {
      // Always use production domain in production (NOT app.manatap.ai, just manatap.ai)
      base = process.env.NEXT_PUBLIC_BASE_URL || 'https://manatap.ai';
    } else {
      // In development, use localhost or explicit base
      base = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl?.origin || 'http://localhost:3000';
    }
    
    const url = `${base}/u/${encodeURIComponent(slug)}`;
    return NextResponse.json({ ok: true, url, is_public });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
