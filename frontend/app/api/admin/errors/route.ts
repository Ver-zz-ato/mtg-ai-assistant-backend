import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit')||'200',10)));
    const { data, error } = await supabase.from('error_logs').select('created_at, kind, message, stack, path').order('created_at', { ascending:false }).limit(limit);
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });
    return NextResponse.json({ ok:true, rows: data||[] });
  } catch (e:any){ return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const body = await req.json().catch(()=>({}));
    const row = {
      kind: String(body?.kind || 'ui'),
      message: String(body?.message || ''),
      stack: String(body?.stack || body?.componentStack || ''),
      path: String(body?.path || ''),
    } as any;
    try { await supabase.from('error_logs').insert(row); } catch {}
    return NextResponse.json({ ok:true });
  } catch (e:any){ return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}