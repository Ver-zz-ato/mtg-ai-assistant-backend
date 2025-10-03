import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try{
    const sb = await createClient();
    const { data: ures } = await sb.auth.getUser();
    const u = ures?.user; if (!u) return NextResponse.json({ ok:false, error:'auth_required' }, { status: 401 });
    const { data } = await sb.from('profiles_public').select('pinned_badges').eq('id', u.id).maybeSingle();
    return NextResponse.json({ ok:true, pinned_badges: (data as any)?.pinned_badges || [] });
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message||'server_error' }, { status:500 }); }
}

export async function POST(req: NextRequest){
  try{
    const sb = await createClient();
    const { data: ures } = await sb.auth.getUser();
    const u = ures?.user; if (!u) return NextResponse.json({ ok:false, error:'auth_required' }, { status: 401 });
    const body = await req.json().catch(()=>({}));
    let pins: string[] = Array.isArray(body?.pinned_badges) ? body.pinned_badges.map((x:any)=>String(x)).slice(0,3) : [];
    // upsert into profiles_public
    const { data: row } = await sb.from('profiles_public').select('id').eq('id', u.id).maybeSingle();
    if (row) {
      const { error: e2 } = await sb.from('profiles_public').update({ pinned_badges: pins }).eq('id', u.id);
      if (e2) return NextResponse.json({ ok:false, error: e2.message }, { status: 500 });
    } else {
      const { error: e3 } = await sb.from('profiles_public').insert({ id: u.id, pinned_badges: pins });
      if (e3) return NextResponse.json({ ok:false, error: e3.message }, { status: 500 });
    }
    return NextResponse.json({ ok:true, pinned_badges: pins });
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}
