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
    if (!wishlist_id || !name) return NextResponse.json({ ok:false, error:'wishlist_id and name required' }, { status:400 });

    const { error } = await (supabase as any)
      .from('wishlist_items')
      .delete()
      .eq('wishlist_id', wishlist_id)
      .eq('name', name);
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });

    return NextResponse.json({ ok:true, removed:true });
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}
