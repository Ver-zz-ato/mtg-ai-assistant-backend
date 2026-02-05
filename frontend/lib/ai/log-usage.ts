/**
 * Centralized AI usage recording for the ai_usage table.
 * Used by chat, chat/stream, deck/analyze, swap-why, swap-suggestions, etc.
 * Tries full payload first, then without optional columns, then minimal (so DB works with or without migration 034).
 */

import { getServerSupabase } from '@/lib/server-supabase';
import { costUSD, PRICING_VERSION } from '@/lib/ai/pricing';

const PREVIEW_MAX = 1000;
const DEV = process.env.NODE_ENV !== 'production';

export type RecordAiUsagePayload = {
  user_id: string | null;
  thread_id?: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  route: string;
  prompt_preview?: string | null;
  response_preview?: string | null;
  model_tier?: string | null;
  prompt_path?: string | null;
  format_key?: string | null;
  deck_size?: number | null;
};

export async function recordAiUsage(payload: RecordAiUsagePayload): Promise<void> {
  try {
    const supabase = await getServerSupabase();
    const cost = typeof payload.cost_usd === 'number' && payload.cost_usd >= 0
      ? payload.cost_usd
      : costUSD(payload.model, payload.input_tokens || 0, payload.output_tokens || 0);

    const full: Record<string, unknown> = {
      user_id: payload.user_id,
      thread_id: payload.thread_id ?? null,
      model: payload.model,
      input_tokens: payload.input_tokens,
      output_tokens: payload.output_tokens,
      cost_usd: cost,
      route: payload.route,
      pricing_version: PRICING_VERSION,
      prompt_preview: payload.prompt_preview != null ? String(payload.prompt_preview).slice(0, PREVIEW_MAX) : null,
      response_preview: payload.response_preview != null ? String(payload.response_preview).slice(0, PREVIEW_MAX) : null,
      model_tier: payload.model_tier ?? null,
      prompt_path: payload.prompt_path ?? null,
      format_key: payload.format_key ?? null,
      deck_size: payload.deck_size != null ? payload.deck_size : null,
    };

    const withoutPreviews = {
      user_id: full.user_id,
      thread_id: full.thread_id,
      model: full.model,
      input_tokens: full.input_tokens,
      output_tokens: full.output_tokens,
      cost_usd: full.cost_usd,
      route: full.route,
      pricing_version: full.pricing_version,
      model_tier: full.model_tier,
      prompt_path: full.prompt_path,
      format_key: full.format_key,
      deck_size: full.deck_size,
    };

    const minimal = {
      user_id: payload.user_id,
      thread_id: payload.thread_id ?? null,
      model: payload.model,
      input_tokens: payload.input_tokens,
      output_tokens: payload.output_tokens,
      cost_usd: cost,
    };

    let inserted = false;
    const { error: e1 } = await supabase.from('ai_usage').insert(full);
    if (!e1) inserted = true;
    if (!inserted) {
      const { error: e2 } = await supabase.from('ai_usage').insert(withoutPreviews);
      if (!e2) inserted = true;
    }
    if (!inserted) {
      const { deck_size: _d, ...withoutDeckSize } = withoutPreviews as Record<string, unknown> & { deck_size?: number };
      const { error: e2b } = await supabase.from('ai_usage').insert(withoutDeckSize);
      if (!e2b) inserted = true;
    }
    if (!inserted) {
      const { error: e3 } = await supabase.from('ai_usage').insert(minimal);
      if (e3 && DEV) console.warn('[recordAiUsage] insert fallback failed:', e3.message);
    }
  } catch (e) {
    if (DEV) console.warn('[recordAiUsage]', e);
  }
}
