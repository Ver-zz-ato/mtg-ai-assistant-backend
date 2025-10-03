import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest){
  try{
    const sb = await createClient();
    const { data: ures } = await sb.auth.getUser();
    if (!ures?.user) return NextResponse.json({ ok:false, error:'auth_required' }, { status: 401 });
    const body = await req.json();
    const id = String(body?.id||''); if (!id) return NextResponse.json({ ok:false, error:'missing_id' }, { status:400 });
    const { error } = await sb.from('custom_cards').delete().eq('id', id).eq('user_id', ures.user.id);
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok:true });
  } catch(e:any){ return NextResponse.json({ ok:false, error:e?.message||'server_error' }, { status: 500 }); }
}