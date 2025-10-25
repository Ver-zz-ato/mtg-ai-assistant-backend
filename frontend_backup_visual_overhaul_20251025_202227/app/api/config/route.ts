import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    // Try to read app_config key 'monetize' (value jsonb)
    try {
      const { data } = await supabase.from('app_config').select('key, value').eq('key', 'monetize').maybeSingle();
      if (data && (data as any).value) {
        return NextResponse.json({ ok: true, monetize: (data as any).value }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } });
      }
    } catch {}
    // Fallback defaults
    return NextResponse.json({ ok: true, monetize: { stripe: true, kofi: true, paypal: true } }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } });
  } catch (e:any) {
    return NextResponse.json({ ok: true, monetize: { stripe: true, kofi: true, paypal: true } }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } });
  }
}