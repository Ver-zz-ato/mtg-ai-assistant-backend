// app/api/events/tools/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest){
  try{
    const supabase = await createClient();
    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user; if (!user) return NextResponse.json({ ok:false, error:'unauthenticated' }, { status:401 });
    const body = await req.json().catch(()=>({}));
    const type = String(body?.type||'');
    const iters = Number(body?.iters||0);

    const md: any = user.user_metadata || {};
    md.tools = md.tools || {};
    if (type==='prob_run') md.tools.prob_runs = (md.tools.prob_runs||0) + 1;
    if (type==='prob_save') md.tools.prob_saves = (md.tools.prob_saves||0) + 1;
    if (type==='mull_run') md.tools.mull_iters_total = (md.tools.mull_iters_total||0) + Math.max(0, Math.floor(iters||0));
    if (type==='card_attach') md.tools.card_attach_count = (md.tools.card_attach_count||0) + 1;
    if (type==='card_art_view') md.tools.card_art_views = (md.tools.card_art_views||0) + 1;

    const { error } = await supabase.auth.updateUser({ data: md });
    if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
    return NextResponse.json({ ok:true });
  } catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message||'failed' }, { status:500 });
  }
}
