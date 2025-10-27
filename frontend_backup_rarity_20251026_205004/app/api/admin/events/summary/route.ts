// app/api/admin/events/summary/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, getSupabaseServer } from '@/lib/server-supabase';
import { getAdmin } from '@/app/api/_lib/supa';

export async function GET(req: NextRequest){
  try{
    // gate: must be admin user
    const supabase = await getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok:false, error:'unauthenticated' }, { status:401 });

    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok:false, error:'missing_service_role_key' }, { status:500 });

    // list first N users and aggregate tool counters from metadata
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 2000 });
    if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });

    let totalProbRuns=0, totalProbSaves=0, totalMullIters=0;
    let mathlete=0, scenario=0, mullMaster=0;
    const topRuns: any[] = [];
    const topIters: any[] = [];

    for (const u of (data?.users||[])){
      const md: any = u?.user_metadata || {};
      const tools: any = md.tools || {};
      const runs = Number(tools.prob_runs||0);
      const saves = Number(tools.prob_saves||0);
      const iters = Number(tools.mull_iters_total||0);
      totalProbRuns += runs;
      totalProbSaves += saves;
      totalMullIters += iters;
      if (runs >= 10) mathlete++;
      if (saves >= 5) scenario++;
      if (iters >= 25000) mullMaster++;
      if (runs>0) topRuns.push({ id:u.id, email:u.email, runs });
      if (iters>0) topIters.push({ id:u.id, email:u.email, iters });
    }
    topRuns.sort((a,b)=>b.runs-a.runs); topIters.sort((a,b)=>b.iters-a.iters);

    return NextResponse.json({ ok:true, totals:{ totalProbRuns, totalProbSaves, totalMullIters }, badges:{ mathlete, scenario, mullMaster }, top:{ runs: topRuns.slice(0,20), iters: topIters.slice(0,20) } });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message||'server_error' }, { status:500 });
  }
}
