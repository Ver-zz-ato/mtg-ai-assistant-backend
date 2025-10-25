import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { parseDeckOrCollectionCSV } from '@/lib/csv/parse';

export const runtime = 'nodejs';

export async function POST(req: Request){
  try{
    const supabase = await getServerSupabase();
    const { data: ures } = await (supabase as any).auth.getUser();
    const user = ures?.user; if (!user) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

    const form = await req.formData().catch(()=>null);
    if (!form) return NextResponse.json({ ok:false, error:'Use multipart/form-data' }, { status:400 });
    const file = form.get('file');
    let wishlistId = String(form.get('wishlistId')||'');
    if (!(file instanceof Blob)) return NextResponse.json({ ok:false, error:'file required' }, { status:400 });

    // Ensure wishlist exists or create default if needed
    if (!wishlistId){
      const { data: wl } = await (supabase as any).from('wishlists').select('id').eq('user_id', user.id).order('created_at',{ascending:true}).limit(1).maybeSingle();
      if (wl?.id) wishlistId = String(wl.id);
      else {
        const { data: ins, error: insErr } = await (supabase as any).from('wishlists').insert({ user_id: user.id, name: 'My Wishlist', is_public:false }).select('id').maybeSingle();
        if (insErr) return NextResponse.json({ ok:false, error: insErr.message }, { status:500 });
        wishlistId = String((ins as any)?.id||'');
      }
    }

    // Ownership check
    const { data: wlRow, error: checkErr } = await (supabase as any).from('wishlists').select('id,user_id').eq('id', wishlistId).maybeSingle();
    if (checkErr || !wlRow) return NextResponse.json({ ok:false, error:'wishlist not found' }, { status:404 });
    if (wlRow.user_id !== user.id) return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });

    const text = await (file as Blob).text();
    const items = parseDeckOrCollectionCSV(text);

    let added=0, updated=0; const skipped:string[]=[];
    for (const it of items){
      const name = String(it.name||'').trim(); const qty = Math.max(1, Number(it.qty||1)); if (!name || !qty) continue;
      const { data: existing } = await (supabase as any).from('wishlist_items').select('id,qty').eq('wishlist_id', wishlistId).eq('name', name).maybeSingle();
      if (existing?.id){
        const { error: upErr } = await (supabase as any).from('wishlist_items').update({ qty: Number(existing.qty||0) + qty }).eq('id', existing.id);
        if (upErr) skipped.push(`${name} (${qty})`); else updated++;
      } else {
        const { error: insErr } = await (supabase as any).from('wishlist_items').insert({ wishlist_id: wishlistId, name, qty });
        if (insErr) skipped.push(`${name} (${qty})`); else added++;
      }
    }

    // Sync wishlist into user metadata (names only, canonicalized)
    try{
      const { data: rows } = await (supabase as any).from('wishlist_items').select('name').eq('wishlist_id', wishlistId);
      const names = Array.from(new Set((rows||[]).map((r:any)=>String(r.name||''))));
      const { canonicalize } = await import('@/lib/cards/canonicalize');
      const merged = names.map(n => (canonicalize as any)(n).canonicalName || n);
      await (supabase as any).auth.updateUser({ data: { wishlist: merged, wishlist_canonical: merged } });
    } catch{}

    return NextResponse.json({ ok:true, wishlist_id: wishlistId, report: { added, updated, skipped, total: items.length } });
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}
