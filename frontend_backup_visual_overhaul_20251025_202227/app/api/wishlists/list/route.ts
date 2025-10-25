import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function GET(){
  try{
    const supabase = await getServerSupabase();
    const { data: userRes } = await (supabase as any).auth.getUser();
    const uid = userRes?.user?.id;
    if(!uid) return NextResponse.json({ ok:true, wishlists: [] });
    const { data, error } = await (supabase as any)
      .from('wishlists')
      .select('id,name,is_public')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok:true, wishlists: data||[] });
  }catch(e:any){ return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}