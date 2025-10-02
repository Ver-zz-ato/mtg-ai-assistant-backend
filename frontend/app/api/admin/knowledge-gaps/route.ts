import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit')||'200',10)));
    const { data, error } = await supabase.from('knowledge_gaps').select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status:500 });
    return NextResponse.json({ ok:true, rows: data||[] });
  } catch (e:any) { return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const body = await req.json().catch(()=>({}));
    const row = {
      route: String(body?.route||'/api/chat'),
      reason: String(body?.reason||'unknown'),
      prompt: String(body?.prompt||''),
      details: body?.details || null,
    } as any;
    try { await supabase.from('knowledge_gaps').insert(row); } catch {}
    return NextResponse.json({ ok:true });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message||'server_error' }, { status:500 });
  }
}