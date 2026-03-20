/**
 * Lightweight operational event logging.
 * Writes to admin_audit with action prefix 'ops_' for entitlement, rate-limit, and fallback visibility.
 * Does NOT log secrets, tokens, or private billing credentials.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type OpsEventType =
  | 'ops_stripe_webhook_processed'
  | 'ops_revenuecat_webhook_processed'
  | 'ops_entitlement_granted'
  | 'ops_entitlement_revoked'
  | 'ops_entitlement_revoke_skipped'
  | 'ops_pro_access_denied'
  | 'ops_rate_limit_hit'
  | 'ops_movers_cache_hit'
  | 'ops_movers_cache_miss'
  | 'ops_deck_series_cache_hit'
  | 'ops_deck_series_cache_miss'
  | 'ops_price_series_direct_hit'
  | 'ops_price_series_api_fallback'
  | 'ops_price_series_api_request';

export type OpsEventPayload = {
  event_type: OpsEventType;
  route?: string;
  status?: 'ok' | 'fail' | 'skipped';
  reason?: string;
  user_id?: string;
  source?: string;
  env?: string;
  [key: string]: unknown;
};

/**
 * Log an operational event to admin_audit. Uses admin client when available (e.g. webhooks).
 * Fails silently if insert fails — never throw from logging.
 */
export async function logOpsEvent(
  supabase: SupabaseClient,
  payload: OpsEventPayload
): Promise<void> {
  try {
    const { event_type, user_id, ...rest } = payload;
    const target = user_id ?? payload.route ?? event_type;
    const safePayload: Record<string, unknown> = {
      ...rest,
      event_type,
      env: payload.env ?? process.env.NODE_ENV ?? 'unknown',
    };
    if (user_id) safePayload.user_id = user_id;

    await supabase.from('admin_audit').insert({
      actor_id: user_id ?? null,
      action: event_type,
      target: String(target).slice(0, 255),
      payload: safePayload,
    });
  } catch {
    // Silently ignore — ops logging must not break request flow
  }
}
