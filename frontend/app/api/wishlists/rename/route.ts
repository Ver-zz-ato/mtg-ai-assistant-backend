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
    const new_name = String(body?.new_name||'').trim();
    if (!wishlist_id || !name || !new_name) return NextResponse.json({ ok:false, error:'wishlist_id, name, new_name required' }, { status:400 });

    // Ownership check on wishlist
    const { data: wl } = await (supabase as any).from('wishlists').select('id,user_id').eq('id', wishlist_id).maybeSingle();
    if (!wl || wl.user_id !== user.id) return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });

    // Fetch existing row for old name
    const { data: existing } = await (supabase as any).from('wishlist_items').select('id, qty').eq('wishlist_id', wishlist_id).eq('name', name).maybeSingle();
    if (!existing?.id) return NextResponse.json({ ok:false, error:'item not found' }, { status:404 });

    // Check if target exists
    const { data: target } = await (supabase as any).from('wishlist_items').select('id, qty').eq('wishlist_id', wishlist_id).eq('name', new_name).maybeSingle();
    if (target?.id){
      // Accumulate qty into target
      const { error: upErr } = await (supabase as any).from('wishlist_items').update({ qty: Number(target.qty||0) + Number(existing.qty||0) }).eq('id', target.id);
      if (upErr) return NextResponse.json({ ok:false, error: upErr.message }, { status:500 });
      const { error: delErr } = await (supabase as any).from('wishlist_items').delete().eq('id', existing.id);
      if (delErr) return NextResponse.json({ ok:false, error: delErr.message }, { status:500 });
    } else {
      // Just update name
      const { error: rnErr } = await (supabase as any).from('wishlist_items').update({ name: new_name }).eq('id', existing.id);
      if (rnErr) return NextResponse.json({ ok:false, error: rnErr.message }, { status:500 });
    }

    // Sync wishlist into user metadata
    try{
      const { data: rows } = await (supabase as any).from('wishlist_items').select('name').eq('wishlist_id', wishlist_id);
      const names = Array.from(new Set((rows||[]).map((r:any)=>String(r.name||''))));
      const { canonicalize } = await import('@/lib/cards/canonicalize');
      const merged = names.map(n => (canonicalize as any)(n).canonicalName || n);
      await (supabase as any).auth.updateUser({ data: { wishlist: merged, wishlist_canonical: merged } });
    } catch{}

    return NextResponse.json({ ok:true });
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}
