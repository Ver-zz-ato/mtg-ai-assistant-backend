import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { getAdmin } from '@/app/api/_lib/supa';

export const runtime = 'nodejs';

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const url = new URL(req.url);
    const keys = url.searchParams.getAll('key');
    let q = supabase.from('app_config').select('key, value');
    if (keys.length) q = q.in('key', keys);
    const { data, error } = await q;
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
    const map: Record<string, any> = {};
    for (const row of (data || [])) map[(row as any).key] = (row as any).value;
    return NextResponse.json({ ok:true, config: map }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok:false, error: 'forbidden' }, { status: 403 });

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok:false, error: 'missing_service_role_key' }, { status: 500 });

    const body = await req.json().catch(()=>({}));
    const key = String(body?.key || '');
    const value = body?.value ?? null;
    if (!key) return NextResponse.json({ ok:false, error: 'missing_key' }, { status: 400 });

    const { error } = await admin.from('app_config').upsert({ key, value }, { onConflict: 'key' });
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });

    try { await admin.from('admin_audit').insert({ actor_id: user.id, action: 'config_set', target: key, payload: value }); } catch {}

    return NextResponse.json({ ok:true, key, value });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status: 500 });
  }
}