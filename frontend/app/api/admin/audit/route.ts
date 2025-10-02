import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.from('admin_audit').select('created_at, actor_id, action, target').order('created_at', { ascending: false }).limit(200);
    if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok:true, rows: data||[] });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'server_error' }, { status: 500 });
  }
}