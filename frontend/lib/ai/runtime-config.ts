/**
 * Runtime AI config from app_config with env overrides.
 * Env kill-switch (e.g. LLM_V2_CONTEXT=off) wins over app_config when explicitly "off".
 * Cache TTL 30s to avoid hitting DB on every request.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const CACHE_TTL_MS = 30_000;

export type RuntimeAIFlags = {
  ai_admin_enabled?: boolean;
  llm_v2_context?: boolean;
  llm_layer0?: boolean;
  llm_two_stage?: boolean;
  llm_stop_sequences?: boolean;
  llm_dynamic_ceilings?: boolean;
  llm_force_mini_only?: boolean;
  llm_disable_stream?: boolean;
};

export type RuntimeAIConfig = {
  flags: RuntimeAIFlags;
  llm_budget: { daily_usd?: number; weekly_usd?: number };
  llm_models: Record<string, unknown> | null;
  llm_thresholds: Record<string, unknown> | null;
};

const DEFAULT_FLAGS: RuntimeAIFlags = {
  ai_admin_enabled: false,
  llm_v2_context: true,
  llm_layer0: false,
  llm_two_stage: true,
  llm_stop_sequences: true,
  llm_dynamic_ceilings: true,
  llm_force_mini_only: false,
  llm_disable_stream: false,
};

const DEFAULT_CONFIG: RuntimeAIConfig = {
  flags: { ...DEFAULT_FLAGS },
  llm_budget: {},
  llm_models: null,
  llm_thresholds: null,
};

let cache: { data: RuntimeAIConfig; ts: number } | null = null;

function applyEnvOverrides(flags: RuntimeAIFlags): RuntimeAIFlags {
  const out = { ...flags };
  if (process.env.LLM_V2_CONTEXT === 'off') out.llm_v2_context = false;
  if (process.env.LLM_LAYER0 !== 'on') out.llm_layer0 = false;
  return out;
}

export async function getRuntimeAIConfig(supabase: SupabaseClient): Promise<RuntimeAIConfig> {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) return cache.data;

  const config: RuntimeAIConfig = {
    flags: { ...DEFAULT_FLAGS },
    llm_budget: {},
    llm_models: null,
    llm_thresholds: null,
  };

  try {
    const { data: rows } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', ['flags', 'llm_budget', 'llm_models', 'llm_thresholds']);

    for (const row of rows || []) {
      const key = (row as { key: string }).key;
      const value = (row as { value: unknown }).value;
      if (key === 'flags' && value && typeof value === 'object')
        config.flags = applyEnvOverrides({ ...DEFAULT_FLAGS, ...(value as RuntimeAIFlags) });
      else if (key === 'llm_budget' && value && typeof value === 'object')
        config.llm_budget = value as RuntimeAIConfig['llm_budget'];
      else if (key === 'llm_models' && value !== null) config.llm_models = value as Record<string, unknown>;
      else if (key === 'llm_thresholds' && value !== null) config.llm_thresholds = value as Record<string, unknown>;
    }
    if (!rows?.length || !rows.some((r: any) => r.key === 'flags'))
      config.flags = applyEnvOverrides(config.flags);
  } catch {
    config.flags = applyEnvOverrides(config.flags);
  }

  cache = { data: config, ts: now };
  return config;
}
