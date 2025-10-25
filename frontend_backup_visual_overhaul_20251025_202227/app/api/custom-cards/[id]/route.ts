import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }){
  try{
    const { id } = await params;
    const sb = await createClient();
    // Try by public_slug first, then by id
    let { data, error } = await sb.from('custom_cards').select('id, title, data, public_slug').eq('public_slug', id).maybeSingle();
    if (!data) {
      const byId = await sb.from('custom_cards').select('id, title, data, public_slug').eq('id', id).maybeSingle();
      data = (byId as any).data; error = (byId as any).error;
    }
    if (error || !data) return NextResponse.json({ ok:false, error: error?.message||'not_found' }, { status: 404 });
    return NextResponse.json({ ok:true, card: data });
  } catch(e:any){ return NextResponse.json({ ok:false, error:e?.message||'server_error' }, { status: 500 }); }
}