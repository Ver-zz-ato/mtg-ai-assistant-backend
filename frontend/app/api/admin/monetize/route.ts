import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { getAdmin } from '@/app/api/_lib/supa';

export const runtime = 'nodejs';

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok:false, error:'forbidden' }, { status: 403 });

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok:false, error:'missing_service_role_key' }, { status:500 });

    const body = await req.json().catch(()=>({}));
    const value = { stripe: !!body?.stripe, kofi: !!body?.kofi, paypal: !!body?.paypal };

    const { error } = await admin.from('app_config').upsert({ key: 'monetize', value }, { onConflict: 'key' });
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });

    return NextResponse.json({ ok:true, value });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status:500 });
  }
}