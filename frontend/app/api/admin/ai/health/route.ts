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

    // ELI5: plain-English explanation of each flag and status
    const eli5: Record<string, string> = {
      openai_key: openai_key_configured
        ? 'Your OpenAI API key is set. Chat can try to call the AI.'
        : 'No OpenAI API key. Chat will say "temporarily unavailable" and won\'t call the AI.',
      ai_admin_enabled: flags.ai_admin_enabled ? 'Admin AI features (e.g. usage board) are enabled.' : 'Admin AI features are off.',
      llm_v2_context: flags.llm_v2_context ? 'Deck context uses the v2 summary (smarter, cheaper).' : 'Deck context uses the older path.',
      llm_layer0: flags.llm_layer0
        ? 'Layer 0 is on: FAQ shortcuts and off-topic guard run before the big model.'
        : 'Layer 0 is off: every message goes to the main model; no FAQ shortcuts, no "MTG only" gate.',
      llm_two_stage: flags.llm_two_stage
        ? 'Two-stage analysis is on (outline then full answer when needed).'
        : 'Two-stage is off; complex questions get one shot.',
      llm_stop_sequences: flags.llm_stop_sequences ? 'Stop sequences trim filler (e.g. "Here are some…").' : 'Stop sequences are off.',
      llm_dynamic_ceilings: flags.llm_dynamic_ceilings ? 'Token limits adjust by request type.' : 'Fixed token limits.',
      llm_force_mini_only: flags.llm_force_mini_only
        ? 'Emergency: only the small model is used. Real deck help will be weaker.'
        : 'Normal: both small and large models can be used.',
      llm_disable_stream: flags.llm_disable_stream ? 'Streaming is disabled; chat waits for full response.' : 'Streaming is on.',
      widgets: flags.widgets ? 'UI widgets (e.g. deck tips) are on.' : 'Widgets are off.',
      chat_extras: flags.chat_extras ? 'Chat extras (e.g. suggestions) are on.' : 'Chat extras are off.',
      risky_betas: flags.risky_betas ? 'Risky beta features are enabled.' : 'Risky betas are off.',
      analytics_clicks_enabled: flags.analytics_clicks_enabled ? 'Click analytics are recorded.' : 'Click analytics are off.',
    };
    // Fill in any flag that doesn't have an eli5 yet (generic)
    const flagsRecord = flags as Record<string, boolean | undefined>;
    for (const k of Object.keys(flagsRecord)) {
      if (!(k in eli5)) eli5[k] = flagsRecord[k] ? `${k} is on.` : `${k} is off.`;
    }

    const diagnosis: string[] = [];
    if (!openai_key_configured) {
      diagnosis.push('API key missing → Set OPENAI_API_KEY in this environment. Chat will stay "temporarily unavailable" until then.');
    } else {
      diagnosis.push('API key is set → Chat can call OpenAI.');
    }
    if (!flags.llm_layer0) {
      diagnosis.push('Layer 0 is off → No FAQ shortcuts and no "MTG only" gate; off-topic questions will use the main model.');
    }
    if (flags.llm_force_mini_only) {
      diagnosis.push('Force mini only is on → Use only as an emergency brake; turn off for normal quality.');
    }

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

    // Add probe result to diagnosis when present
    if (probe) {
      if (probe.ok) {
        diagnosis.push(`Probe OK (${probe.latency_ms ?? 0} ms) → OpenAI is reachable from this environment.`);
      } else {
        const err = (probe.error ?? '').toLowerCase();
        if (err.includes('not configured') || err.includes('api key')) {
          diagnosis.push('Probe failed: API key missing or invalid → Check OPENAI_API_KEY.');
        } else if (err.includes('rate limit') || err.includes('429')) {
          diagnosis.push('Probe failed: Rate limit (429) → Wait or check OpenAI usage/quota.');
        } else if (err.includes('401') || err.includes('403') || err.includes('authentication')) {
          diagnosis.push('Probe failed: Auth error → Key may be wrong or revoked.');
        } else if (err.includes('500') || err.includes('503') || err.includes('temporarily unavailable')) {
          diagnosis.push('Probe failed: OpenAI server error → Try again in a few minutes.');
        } else if (err.includes('timeout') || err.includes('timed out')) {
          diagnosis.push('Probe failed: Timeout → Network or OpenAI slow; try again.');
        } else {
          diagnosis.push(`Probe failed: ${probe.error ?? 'Unknown'} → Fix the error above or run probe again.`);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      openai_key_configured,
      runtime_flags: flags,
      eli5,
      diagnosis,
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
