import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function POST(req: NextRequest){
  try{
    const supabase = await getServerSupabase();
    const { data: ures } = await (supabase as any).auth.getUser();
    const user = ures?.user; if (!user) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

    const body = await req.json().catch(()=>({}));
    const wishlist_id: string = String(body?.wishlist_id||'');
    const names: string[] = Array.isArray(body?.names) ? body.names.map((s:any)=>String(s||'').trim()).filter(Boolean) : [];
    if (!wishlist_id || !names.length) return NextResponse.json({ ok:false, error:'wishlist_id and names required' }, { status:400 });

    // Ownership check
    const { data: wl } = await (supabase as any).from('wishlists').select('id,user_id').eq('id', wishlist_id).maybeSingle();
    if (!wl || wl.user_id !== user.id) return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });

    // Delete in batch (chunk to be safe)
    let removed = 0;
    const chunk = 100;
    for (let i=0; i<names.length; i+=chunk){
      const part = names.slice(i, i+chunk);
      const { error, count } = await (supabase as any)
        .from('wishlist_items')
        .delete({ count: 'exact' })
        .eq('wishlist_id', wishlist_id)
        .in('name', part);
      if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });
      removed += Number(count||0);
    }

    // Sync wishlist into user metadata after removal
    try{
      const { data: rows } = await (supabase as any).from('wishlist_items').select('name').eq('wishlist_id', wishlist_id);
      const uniq = Array.from(new Set<string>((rows||[]).map((r:any)=>String(r.name||''))));
      const { canonicalize } = await import('@/lib/cards/canonicalize');
      const merged = uniq.map((n)=> (canonicalize as any)(n).canonicalName || n);
      await (supabase as any).auth.updateUser({ data: { wishlist: merged, wishlist_canonical: merged } });
    } catch{}

    return NextResponse.json({ ok:true, removed });
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}
