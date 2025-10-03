import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest){
  try{
    const sb = await createClient();
    const { data: ures } = await sb.auth.getUser();
    const user = ures?.user; if (!user) return NextResponse.json({ ok:false, error:'auth_required' }, { status: 401 });
    const { id } = await req.json().catch(()=>({}));
    if (!id) return NextResponse.json({ ok:false, error:'missing_id' }, { status: 400 });

    // Verify ownership and fetch card data
    const { data: row, error } = await sb.from('custom_cards').select('id, data').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
    if (!row) return NextResponse.json({ ok:false, error:'not_found' }, { status: 404 });

    const val: any = (row as any).data || {};
    const payload = {
      name: Array.isArray(val?.nameParts)? String(val.nameParts.join(' ')) : String(val?.name||'Custom Card'),
      sub: String(val?.subtext||val?.sub||''),
      art: String(val?.art?.url || val?.artUrl || val?.art || ''),
      artist: String(val?.artist||val?.art?.artist||''),
      scryfall: String(val?.scryUri||val?.art?.id||''),
      color: String(val?.colorHint||'U'),
      show_on_banner: false,
      source_id: String(id),
    } as any;

    // Update auth metadata and public profile snapshot
    const md = { ...(user.user_metadata||{}), custom_card: payload } as any;
    const { error: e1 } = await sb.auth.updateUser({ data: md });
    if (e1) return NextResponse.json({ ok:false, error:e1.message }, { status: 500 });

    const up = await sb.from('profiles_public').select('id').eq('id', user.id).maybeSingle();
    if (up.data) {
      const { error: e2 } = await sb.from('profiles_public').update({ custom_card: payload }).eq('id', user.id);
      if (e2) return NextResponse.json({ ok:false, error: e2.message }, { status: 500 });
    } else {
      const { error: e3 } = await sb.from('profiles_public').insert({ id: user.id, custom_card: payload });
      if (e3) return NextResponse.json({ ok:false, error: e3.message }, { status: 500 });
    }

    return NextResponse.json({ ok:true, source_id: String(id) });
  } catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status: 500 });
  }
}
