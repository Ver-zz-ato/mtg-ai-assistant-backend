import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

import { sameOriginOk } from "@/lib/api/csrf";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user;
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    if (!sameOriginOk(req)) return NextResponse.json({ ok: false, error: 'bad_origin' }, { status: 403 });
    const body = await req.json().catch(()=>({}));
    const pinned: string[] = Array.isArray(body?.pinned_deck_ids) ? body.pinned_deck_ids.filter(Boolean).slice(0,3) : [];

    // Verify ownership of pinned decks
    if (pinned.length) {
      const { data: rows } = await supabase.from('decks').select('id').in('id', pinned).eq('user_id', user.id);
      const owned = new Set((rows||[]).map((r:any)=>String(r.id)));
      for (const id of pinned) { if (!owned.has(id)) return NextResponse.json({ ok: false, error: 'invalid_deck' }, { status: 400 }); }
    }

    const row = { id: user.id, pinned_deck_ids: pinned } as any;
    const { error } = await supabase.from('profiles_public').upsert(row, { onConflict: 'id' });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, pinned_deck_ids: pinned });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
