import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const url = new URL(req.url);
    const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') || '30', 10)));
    const since = new Date(Date.now() - days*24*60*60*1000).toISOString();

    // Try querying persona_id; if column missing, catch and return available:false
    try {
      const { data, error } = await supabase
        .from('ai_usage')
        .select('persona_id, created_at', { count: 'exact' })
        .gte('created_at', since);
      if (error) throw error;
      // Aggregate in memory (PostgREST doesn't support group by easily here without RPC)
      const map = new Map<string, number>();
      for (const row of (data || []) as any[]) {
        const key = String(row.persona_id || 'unknown');
        map.set(key, (map.get(key) || 0) + 1);
      }
      const by_persona = Array.from(map.entries()).map(([persona_id, messages]) => ({ persona_id, messages }))
        .sort((a,b)=>b.messages - a.messages);
      return NextResponse.json({ ok:true, available: true, window_days: days, by_persona });
    } catch (e:any) {
      // Column likely missing
      return NextResponse.json({ ok:true, available: false, window_days: days, by_persona: [] });
    }
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
