import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(){
  try{
    const sb = await createClient();
    const { data: ures } = await sb.auth.getUser();
    if (!ures?.user) return NextResponse.json({ ok:false, error:'auth_required' }, { status: 401 });
const { data, error } = await sb.from('custom_cards').select('id, title, public_slug, created_at, data').eq('user_id', ures.user.id).order('created_at', { ascending: false }).limit(50);
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok:true, rows: data||[] });
  } catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status: 500 }); }
}