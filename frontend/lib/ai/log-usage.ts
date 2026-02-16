/**
 * Centralized AI usage recording for the ai_usage table.
 * Used by chat, chat/stream, deck/analyze, swap-why, swap-suggestions, etc.
 * Tries full payload first, then without optional columns, then minimal (so DB works with or without migration 034).
 *
 * Audit checklist: model (actual model used), layer0_mode/request_kind (gate mode result),
 * input_tokens (rough estimate when usage not available), cache_hit, cache_kind.
 */

import { getServerSupabase } from '@/lib/server-supabase';
import { costUSD, PRICING_VERSION } from '@/lib/ai/pricing';

const PREVIEW_MAX = 1000;
const DEV = process.env.NODE_ENV !== 'production';

/** Normalize route for ai_usage insert; never null. */
export function getRouteForInsert(payload: { route?: string | null }): string {
  return payload.route && String(payload.route).trim() ? String(payload.route).trim() : "unknown";
}

export type RecordAiUsagePayload = {
  user_id: string | null;
  /** For joining with user_attribution. hash(guest_token) or hash(user_id). */
  anon_id?: string | null;
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
  /** LLM v2: linked_db | paste_ttl | raw_fallback */
  context_source?: string | null;
  summary_tokens_estimate?: number | null;
  deck_hash?: string | null;
  /** Layer 0: NO_LLM | MINI_ONLY | FULL_LLM */
  layer0_mode?: string | null;
  layer0_reason?: string | null;
  /** Canonical analytics alias for layer0_mode */
  request_kind?: string | null;
  has_deck_context?: boolean | null;
  deck_card_count?: number | null;
  used_v2_summary?: boolean | null;
  used_two_stage?: boolean | null;
  planner_model?: string | null;
  planner_tokens_in?: number | null;
  planner_tokens_out?: number | null;
  planner_cost_usd?: number | null;
  stop_sequences_enabled?: boolean | null;
  max_tokens_config?: number | null;
  response_truncated?: boolean | null;
  user_tier?: string | null;
  is_guest?: boolean | null;
  deck_id?: string | null;
  latency_ms?: number | null;
  cache_hit?: boolean | null;
  cache_kind?: string | null;
  error_code?: string | null;
  /** 3-tier: micro | standard | full */
  prompt_tier?: string | null;
  /** Rough estimate of system prompt tokens */
  system_prompt_token_estimate?: number | null;
  /** Where the call originated (e.g. deck_page_analyze, homepage, build_assistant) */
  source_page?: string | null;
};

export async function recordAiUsage(payload: RecordAiUsagePayload): Promise<void> {
  try {
    if (DEV && !payload.route) {
      console.warn("[ai_usage] missing route", { model: payload.model, hasRoute: !!payload.route });
    }
    const route = getRouteForInsert(payload);
    const supabase = await getServerSupabase();
    const cost = typeof payload.cost_usd === 'number' && payload.cost_usd >= 0
      ? payload.cost_usd
      : costUSD(payload.model, payload.input_tokens || 0, payload.output_tokens || 0);

    const requestKind = payload.request_kind ?? payload.layer0_mode ?? null;
    const full: Record<string, unknown> = {
      user_id: payload.user_id,
      anon_id: payload.anon_id ?? null,
      thread_id: payload.thread_id ?? null,
      model: payload.model,
      input_tokens: payload.input_tokens,
      output_tokens: payload.output_tokens,
      cost_usd: cost,
      route,
      pricing_version: PRICING_VERSION,
      prompt_preview: payload.prompt_preview != null ? String(payload.prompt_preview).slice(0, PREVIEW_MAX) : null,
      response_preview: payload.response_preview != null ? String(payload.response_preview).slice(0, PREVIEW_MAX) : null,
      model_tier: payload.model_tier ?? null,
      prompt_path: payload.prompt_path ?? null,
      format_key: payload.format_key ?? null,
      deck_size: payload.deck_size != null ? payload.deck_size : null,
      context_source: payload.context_source ?? null,
      summary_tokens_estimate: payload.summary_tokens_estimate ?? null,
      deck_hash: payload.deck_hash ?? null,
      layer0_mode: payload.layer0_mode ?? null,
      layer0_reason: payload.layer0_reason ?? null,
      request_kind: requestKind,
      has_deck_context: payload.has_deck_context ?? null,
      deck_card_count: payload.deck_card_count ?? null,
      used_v2_summary: payload.used_v2_summary ?? null,
      used_two_stage: payload.used_two_stage ?? null,
      planner_model: payload.planner_model ?? null,
      planner_tokens_in: payload.planner_tokens_in ?? null,
      planner_tokens_out: payload.planner_tokens_out ?? null,
      planner_cost_usd: payload.planner_cost_usd ?? null,
      stop_sequences_enabled: payload.stop_sequences_enabled ?? null,
      max_tokens_config: payload.max_tokens_config ?? null,
      response_truncated: payload.response_truncated ?? null,
      user_tier: payload.user_tier ?? null,
      is_guest: payload.is_guest ?? null,
      deck_id: payload.deck_id ?? null,
      latency_ms: payload.latency_ms ?? null,
      cache_hit: payload.cache_hit ?? null,
      cache_kind: payload.cache_kind ?? null,
      error_code: payload.error_code ?? null,
      prompt_tier: payload.prompt_tier ?? null,
      system_prompt_token_estimate: payload.system_prompt_token_estimate ?? null,
      source_page: payload.source_page ?? null,
    };

    const withoutPreviews = {
      user_id: full.user_id,
      anon_id: full.anon_id,
      thread_id: full.thread_id,
      model: full.model,
      input_tokens: full.input_tokens,
      output_tokens: full.output_tokens,
      cost_usd: full.cost_usd,
      route,
      pricing_version: full.pricing_version,
      model_tier: full.model_tier,
      prompt_path: full.prompt_path,
      format_key: full.format_key,
      deck_size: full.deck_size,
      context_source: full.context_source,
      summary_tokens_estimate: full.summary_tokens_estimate,
      deck_hash: full.deck_hash,
      layer0_mode: full.layer0_mode,
      layer0_reason: full.layer0_reason,
      request_kind: full.request_kind,
      has_deck_context: full.has_deck_context,
      deck_card_count: full.deck_card_count,
      used_v2_summary: full.used_v2_summary,
      used_two_stage: full.used_two_stage,
      planner_model: full.planner_model,
      planner_tokens_in: full.planner_tokens_in,
      planner_tokens_out: full.planner_tokens_out,
      planner_cost_usd: full.planner_cost_usd,
      stop_sequences_enabled: full.stop_sequences_enabled,
      max_tokens_config: full.max_tokens_config,
      response_truncated: full.response_truncated,
      user_tier: full.user_tier,
      is_guest: full.is_guest,
      deck_id: full.deck_id,
      latency_ms: full.latency_ms,
      cache_hit: full.cache_hit,
      cache_kind: full.cache_kind,
      error_code: full.error_code,
      prompt_tier: full.prompt_tier,
      system_prompt_token_estimate: full.system_prompt_token_estimate,
      source_page: full.source_page,
    };

    const minimal: Record<string, unknown> = {
      user_id: payload.user_id,
      anon_id: payload.anon_id ?? null,
      thread_id: payload.thread_id ?? null,
      model: payload.model,
      input_tokens: payload.input_tokens,
      output_tokens: payload.output_tokens,
      cost_usd: cost,
      route,
    };
    if (payload.prompt_preview != null && String(payload.prompt_preview).trim()) minimal.prompt_preview = String(payload.prompt_preview).slice(0, PREVIEW_MAX);
    if (payload.response_preview != null && String(payload.response_preview).trim()) minimal.response_preview = String(payload.response_preview).slice(0, PREVIEW_MAX);

    let inserted = false;
    const { error: e1 } = await supabase.from('ai_usage').insert(full);
    if (!e1) inserted = true;
    if (!inserted) {
      const { error: e2 } = await supabase.from('ai_usage').insert(withoutPreviews);
      if (!e2) inserted = true;
    }
    if (!inserted) {
      const omitNew = [
        'request_kind', 'has_deck_context', 'deck_card_count', 'used_v2_summary', 'used_two_stage',
        'planner_model', 'planner_tokens_in', 'planner_tokens_out', 'planner_cost_usd',
        'stop_sequences_enabled', 'max_tokens_config', 'response_truncated', 'user_tier', 'is_guest',
        'deck_id', 'latency_ms', 'cache_hit', 'cache_kind', 'error_code',
        'prompt_tier', 'system_prompt_token_estimate', 'source_page',
      ];
      const fallback = { ...withoutPreviews } as Record<string, unknown>;
      omitNew.forEach((k) => delete fallback[k]);
      const { error: e2b } = await supabase.from('ai_usage').insert(fallback);
      if (!e2b) inserted = true;
    }
    if (!inserted) {
      const { deck_size: _d, context_source: _cs, summary_tokens_estimate: _ste, deck_hash: _dh, layer0_mode: _l0m, layer0_reason: _l0r, source_page: _sp, ...legacy } = withoutPreviews as Record<string, unknown> & { deck_size?: number; context_source?: string; summary_tokens_estimate?: number; deck_hash?: string; layer0_mode?: string; layer0_reason?: string; source_page?: string };
      const { error: e2c } = await supabase.from('ai_usage').insert(legacy);
      if (!e2c) inserted = true;
    }
    if (!inserted) {
      const { error: e3 } = await supabase.from('ai_usage').insert(minimal);
      if (e3 && DEV) console.warn('[recordAiUsage] insert fallback failed:', e3.message);
    }
  } catch (e) {
    if (DEV) console.warn('[recordAiUsage]', e);
  }
}
