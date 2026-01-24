import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function POST(req: NextRequest){
  try{
    const supabase = await getServerSupabase();
    const { data: ures } = await (supabase as any).auth.getUser();
    const user = ures?.user; 
    if (!user) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });
    
    // Use standardized Pro check that checks both database and metadata
    const { checkProStatus } = await import('@/lib/server-pro-check');
    const isPro = await checkProStatus(user.id);
    if (!isPro) return NextResponse.json({ ok:false, error:'pro_required' }, { status:403 });

    const body = await req.json().catch(()=>({}));
    const wishlist_id = String(body?.wishlist_id||'');
    const changes: Array<{ from:string; to:string }> = Array.isArray(body?.changes) ? body.changes : [];
    if (!wishlist_id || !changes.length) return NextResponse.json({ ok:false, error:'wishlist_id and changes required' }, { status:400 });

    // Ownership check on wishlist
    const { data: wl } = await (supabase as any).from('wishlists').select('id,user_id').eq('id', wishlist_id).maybeSingle();
    if (!wl || wl.user_id !== user.id) return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });

    for (const ch of changes){
      const from = String(ch?.from||'').trim(); const to = String(ch?.to||'').trim(); if (!from || !to) continue;
      const { data: existing } = await (supabase as any).from('wishlist_items').select('id,qty').eq('wishlist_id', wishlist_id).eq('name', from).maybeSingle();
      if (!existing?.id) continue;
      const { data: target } = await (supabase as any).from('wishlist_items').select('id,qty').eq('wishlist_id', wishlist_id).eq('name', to).maybeSingle();
      if (target?.id){
        const { error: upErr } = await (supabase as any).from('wishlist_items').update({ qty: Number(target.qty||0) + Number(existing.qty||0) }).eq('id', target.id);
        if (upErr) return NextResponse.json({ ok:false, error: upErr.message }, { status:500 });
        const { error: delErr } = await (supabase as any).from('wishlist_items').delete().eq('id', existing.id);
        if (delErr) return NextResponse.json({ ok:false, error: delErr.message }, { status:500 });
      } else {
        const { error: rnErr } = await (supabase as any).from('wishlist_items').update({ name: to }).eq('id', existing.id);
        if (rnErr) return NextResponse.json({ ok:false, error: rnErr.message }, { status:500 });
      }
    }

    // Sync wishlist metadata after batch
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
