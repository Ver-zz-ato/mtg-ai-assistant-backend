import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function POST(req: NextRequest){
  try{
    const supabase = await getServerSupabase();
    const { data: ures } = await (supabase as any).auth.getUser();
    const user = ures?.user; if (!user) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

    const body = await req.json().catch(()=>({}));
    const wishlist_id = String(body?.wishlist_id||'');
    const name = String(body?.name||'').trim();
    const qty = Number(body?.qty);
    if (!wishlist_id || !name || !Number.isFinite(qty)) return NextResponse.json({ ok:false, error:'wishlist_id, name, qty required' }, { status:400 });

    // Upsert exact quantity: if qty <= 0 -> delete; else set qty
    if (qty <= 0){
      const { error: delErr } = await (supabase as any)
        .from('wishlist_items')
        .delete()
        .eq('wishlist_id', wishlist_id)
        .eq('name', name);
      if (delErr) return NextResponse.json({ ok:false, error: delErr.message }, { status:500 });
      return NextResponse.json({ ok:true, removed: true });
    }

    // Check if exists
    const { data: existing } = await (supabase as any)
      .from('wishlist_items')
      .select('id')
      .eq('wishlist_id', wishlist_id)
      .eq('name', name)
      .maybeSingle();
    if (existing?.id){
      const { error: upErr } = await (supabase as any)
        .from('wishlist_items')
        .update({ qty })
        .eq('id', existing.id);
      if (upErr) return NextResponse.json({ ok:false, error: upErr.message }, { status:500 });
    } else {
      const { error: insErr } = await (supabase as any)
        .from('wishlist_items')
        .insert({ wishlist_id, name, qty });
      if (insErr) return NextResponse.json({ ok:false, error: insErr.message }, { status:500 });
    }
    return NextResponse.json({ ok:true });
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}
