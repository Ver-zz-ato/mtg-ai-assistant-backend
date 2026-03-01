import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { withMetrics } from '@/lib/observability/withMetrics';

export const runtime = 'nodejs';

async function getHandler(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const url = new URL(req.url);
    const requestedKey = url.searchParams.get('key');
    
    // Handle query param for specific keys (e.g., ?key=flags)
    if (requestedKey) {
      try {
        const { data } = await supabase.from('app_config').select('key, value').eq('key', requestedKey).maybeSingle();
        if (data && (data as any).value) {
          return NextResponse.json({ 
            ok: true, 
            config: { [requestedKey]: (data as any).value } 
          }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } });
        }
        // Return empty object if key not found
        return NextResponse.json({ 
          ok: true, 
          config: {} 
        }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } });
      } catch (e: any) {
        return NextResponse.json({ ok: true, config: {} }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } });
      }
    }
    
    // Default: return monetize config (for backward compatibility)
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

export const GET = withMetrics(getHandler);