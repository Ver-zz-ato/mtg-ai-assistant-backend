import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET() {
  try {
    if (!url || !anon) throw new Error('Missing Supabase env');

    const supabase = createClient(url, anon, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from('decks')
      .select('id,title,created_at')
      .eq('public', true)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json({ ok: true, decks: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || 'Unknown error' }, { status: 500 });
  }
}
