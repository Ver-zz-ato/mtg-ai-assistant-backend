import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const url = new URL(req.url);
    const name = url.searchParams.get('name');
    if (!name) return NextResponse.json({ ok:false, error:'name required' }, { status:400 });
    const { data, error } = await supabase.from('scryfall_cache').select('*').eq('name', name).maybeSingle();
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });
    return NextResponse.json({ ok:true, row: data||null });
  } catch (e:any) { return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    // Allow any signed-in admin to refresh
    const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
    const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
    const uid = String(user?.id || ''); const email = String(user?.email||'').toLowerCase();
    if (!user || (!ids.includes(uid) && !emails.includes(email))) return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });
    const body = await req.json().catch(()=>({}));
    const name = String(body?.name||'');
    if (!name) return NextResponse.json({ ok:false, error:'name required' }, { status:400 });
    // Kick a simple refresh by deleting the row; next fetch should repopulate on demand (as per app logic)
    try { await supabase.from('scryfall_cache').delete().eq('name', name); } catch {}
    return NextResponse.json({ ok:true, refreshed: name });
  } catch (e:any) { return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}