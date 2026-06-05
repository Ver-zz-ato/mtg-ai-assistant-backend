import { NextRequest, NextResponse } from 'next/server';
import { createClient, getServiceRoleClient } from '@/lib/supabase/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }){
  try{
    const { id } = await params;
    const admin = getServiceRoleClient();
    if (admin) {
      let { data } = await admin
        .from('custom_cards')
        .select('id, title, data, public_slug, user_id')
        .eq('public_slug', id)
        .maybeSingle();
      if (!data) {
        const byPublicId = await admin
          .from('custom_cards')
          .select('id, title, data, public_slug, user_id')
          .eq('id', id)
          .not('public_slug', 'is', null)
          .maybeSingle();
        data = byPublicId.data;
      }
      if (data) return NextResponse.json({ ok:true, card: data });
    }

    const sb = await createClient();
    // Session fallback for owner previews of private cards.
    let { data, error } = await sb.from('custom_cards').select('id, title, data, public_slug, user_id').eq('public_slug', id).maybeSingle();
    if (!data) {
      const byId = await sb.from('custom_cards').select('id, title, data, public_slug, user_id').eq('id', id).maybeSingle();
      data = (byId as any).data; error = (byId as any).error;
    }
    if (error || !data) return NextResponse.json({ ok:false, error: error?.message||'not_found' }, { status: 404 });
    return NextResponse.json({ ok:true, card: data });
  } catch(e:any){ return NextResponse.json({ ok:false, error:e?.message||'server_error' }, { status: 500 }); }
}
