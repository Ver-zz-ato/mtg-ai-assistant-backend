// app/api/profile/custom-card/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest){
  try{
    const supabase = await createClient();
    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user; if (!user) return NextResponse.json({ ok:false, error:'unauthenticated' }, { status:401 });
    const authMd: any = user.user_metadata?.custom_card || null;
    let publicRow: any = null;
    try {
      const { data } = await supabase.from('profiles_public').select('custom_card').eq('id', user.id).maybeSingle();
      publicRow = (data as any)?.custom_card || null;
    } catch {}
    return NextResponse.json({ ok:true, auth: authMd, public: publicRow });
  } catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message||'failed' }, { status:500 });
  }
}

export async function POST(req: NextRequest){
  try{
    const supabase = await createClient();
    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user; if (!user) return NextResponse.json({ ok:false, error:'unauthenticated' }, { status:401 });
    const body = await req.json().catch(()=>({}));
    const payload = {
      name: String(body?.name||'').slice(0,120),
      sub: String(body?.sub||'').slice(0,200),
      art: String(body?.art||''),
      artist: String(body?.artist||''),
      scryfall: String(body?.scryfall||''),
      color: String(body?.color||''),
      show_on_banner: Boolean(body?.show_on_banner || false),
    } as any;

    // Update auth metadata
    const md = { ...(user.user_metadata||{}), custom_card: payload } as any;
    const { error: e1 } = await supabase.auth.updateUser({ data: md });
    if (e1) return NextResponse.json({ ok:false, error:e1.message }, { status:500 });

    // Upsert profiles_public.custom_card
    try{
      const { data: row } = await supabase.from('profiles_public').select('id').eq('id', user.id).maybeSingle();
      if (row) await supabase.from('profiles_public').update({ custom_card: payload }).eq('id', user.id);
      else await supabase.from('profiles_public').insert({ id: user.id, custom_card: payload });
    } catch{}

    return NextResponse.json({ ok:true, custom_card: payload });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message||'failed' }, { status:500 });
  }
}

export async function PUT(req: NextRequest){
  try{
    const supabase = await createClient();
    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user; if (!user) return NextResponse.json({ ok:false, error:'unauthenticated' }, { status:401 });
    const body = await req.json().catch(()=>({}));
    const show = Boolean(body?.show_on_banner);

    // Read existing from auth metadata
    const prev: any = user.user_metadata?.custom_card || {};
    const next = { ...prev, show_on_banner: show };

    // Update auth metadata
    const { error: e1 } = await supabase.auth.updateUser({ data: { ...(user.user_metadata||{}), custom_card: next } });
    if (e1) return NextResponse.json({ ok:false, error:e1.message }, { status:500 });

    // Update public profile row
    try{
      const { data: row } = await supabase.from('profiles_public').select('id').eq('id', user.id).maybeSingle();
      if (row) await supabase.from('profiles_public').update({ custom_card: next }).eq('id', user.id);
      else await supabase.from('profiles_public').insert({ id: user.id, custom_card: next });
    } catch{}

    return NextResponse.json({ ok:true, custom_card: next });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message||'failed' }, { status:500 });
  }
}
