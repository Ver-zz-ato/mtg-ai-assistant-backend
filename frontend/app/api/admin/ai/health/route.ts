import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/server-supabase';
import { isAdmin } from '@/lib/admin-check';
import { getRuntimeAIConfig } from '@/lib/ai/runtime-config';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

    const openai_key_configured = !!process.env.OPENAI_API_KEY;
    const config = await getRuntimeAIConfig(supabase);
    const flags = config.flags;

    const probeParam = req.nextUrl.searchParams.get('probe');
    let probe: { ok: boolean; latency_ms?: number; error?: string; model_used?: string; fallback?: boolean } | null = null;

    if (probeParam === '1' || probeParam === 'true') {
      const start = Date.now();
      if (!openai_key_configured) {
        probe = { ok: false, error: 'OPENAI_API_KEY not set' };
      } else {
        try {
          const { callLLM } = await import('@/lib/ai/unified-llm-client');
          const res = await callLLM(
            [
              { role: 'system', content: 'Reply with exactly: OK' },
              { role: 'user', content: 'Ping' },
            ],
            {
              route: '/api/admin/ai/health',
              feature: 'debug_ping',
              model: 'gpt-4o-mini',
              fallbackModel: 'gpt-4o-mini',
              timeout: 15000,
              maxTokens: 5,
              apiType: 'chat',
              skipRecordAiUsage: true,
            }
          );
          const latency_ms = Date.now() - start;
          const textOk = res.text?.trim().toUpperCase() === 'OK' || (res.text?.trim().length ?? 0) > 0;
          probe = {
            ok: textOk,
            latency_ms,
            model_used: res.actualModel,
            fallback: res.fallback,
          };
        } catch (e: unknown) {
          const err = e instanceof Error ? e : new Error(String(e));
          probe = {
            ok: false,
            latency_ms: Date.now() - start,
            error: err.message || String(e),
          };
        }
      }
    }

    return NextResponse.json({
      ok: true,
      openai_key_configured,
      runtime_flags: flags,
      probe: probe ?? undefined,
      ts: new Date().toISOString(),
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: (e instanceof Error ? e.message : String(e)) || 'server_error' },
      { status: 500 }
    );
  }
}
