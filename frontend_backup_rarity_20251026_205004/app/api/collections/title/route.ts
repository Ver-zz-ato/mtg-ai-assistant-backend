import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get("id")||"");
    if (!id) return NextResponse.json({ ok:false, error:'id required' }, { status:400 });
    const { data, error } = await supabase.from('collections').select('id, name, user_id').eq('id', id).maybeSingle();
    if (error || !data) return NextResponse.json({ ok:false, error: error?.message||'not_found' }, { status: error?500:404 });
    return NextResponse.json({ ok:true, id: data.id, name: data.name });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json().catch(()=>({}));
    const id = String(body?.id||'');
    const name = String(body?.name||'').trim();
    if (!id || !name) return NextResponse.json({ ok:false, error:'id and name required' }, { status:400 });

    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user; if (!user) return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });

    const { data: col } = await supabase.from('collections').select('id,user_id').eq('id', id).maybeSingle();
    if (!col || col.user_id !== user.id) return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });

    const { error } = await supabase.from('collections').update({ name }).eq('id', id);
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });

    return NextResponse.json({ ok:true, id, name });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 });
  }
}
