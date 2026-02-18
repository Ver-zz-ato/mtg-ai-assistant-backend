/**
 * Log mulligan advice runs to Supabase for admin visibility.
 * Uses service role. Called from admin and production advice APIs.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

function getSupabaseAdmin() {
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export type MulliganRunLogInput = {
  source: "admin_playground" | "production_widget";
  userId?: string | null;
  deckSummary?: string | null;
  handSummary?: string | null;
  inputJson?: Record<string, unknown> | null;
  outputJson?: Record<string, unknown> | null;
  llmUsed: boolean;
  modelUsed?: string | null;
  costUsd?: number | null;
  cached: boolean;
  effectiveTier?: string | null;
  gateAction?: string | null;
};

/** Truncate for display (deck/hand summaries) */
function truncate(s: string, max = 200): string {
  if (!s || s.length <= max) return s;
  return s.slice(0, max) + "...";
}

export async function logMulliganRun(input: MulliganRunLogInput): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    await supabase.from("mulligan_advice_runs").insert({
      source: input.source,
      user_id: input.userId ?? null,
      deck_summary: truncate(input.deckSummary ?? ""),
      hand_summary: truncate(input.handSummary ?? ""),
      input_json: input.inputJson ?? null,
      output_json: input.outputJson ?? null,
      llm_used: input.llmUsed,
      model_used: input.modelUsed ?? null,
      cost_usd: input.costUsd ?? null,
      cached: input.cached,
      effective_tier: input.effectiveTier ?? null,
      gate_action: input.gateAction ?? null,
    });
  } catch (e) {
    console.error("[mulligan/run-logger] Failed to log run:", e);
  }
}
