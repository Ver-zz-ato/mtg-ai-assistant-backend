import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const url = new URL(req.url);
    const hours = Math.max(1, Math.min(72, parseInt(url.searchParams.get('hours')||'24',10)));
    const since = new Date(Date.now() - hours*60*60*1000).toISOString();
    const { data, error } = await supabase.from('likes_audit').select('user_id, ip_hash').gte('created_at', since);
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
    const byUser: Record<string, number> = {}; const byIp: Record<string, number> = {};
    for (const r of (data||[])) { const u=(r as any).user_id||'anon'; const ip=(r as any).ip_hash||'unknown'; byUser[u]=(byUser[u]||0)+1; byIp[ip]=(byIp[ip]||0)+1; }
    const topUsers = Object.entries(byUser).sort((a,b)=>b[1]-a[1]).slice(0,50).map(([k,v])=>({ user_id:k, count:v }));
    const topIps = Object.entries(byIp).sort((a,b)=>b[1]-a[1]).slice(0,50).map(([k,v])=>({ ip_hash:k, count:v }));
    return NextResponse.json({ ok:true, hours, topUsers, topIps });
  } catch (e:any) { return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}