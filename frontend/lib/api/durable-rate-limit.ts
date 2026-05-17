/**
 * Durable Rate Limiting
 *
 * Database-backed rate limiting for expensive AI / high-cost routes.
 *
 * Security posture:
 * - Prefer the atomic `increment_rate_limit` RPC path only.
 * - Treat missing service-role / RPC config as limiter infrastructure failure.
 * - Fail closed for guests, anonymous traffic, and free users.
 * - Allow a small in-memory emergency fallback only for verified Pro users.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceRoleClient } from '@/lib/server-supabase';

export type DurableRateLimitIdentity = 'anonymous' | 'guest' | 'free' | 'pro';

export type DurableRateLimitFailureCategory =
  | 'missing_service_role'
  | 'rpc_error'
  | 'rpc_exception'
  | 'rpc_unexpected_response'
  | 'exception';

export interface DurableRateLimitOptions {
  identity?: DurableRateLimitIdentity;
  verifiedUserId?: string | null;
  serviceClientOverride?: SupabaseClient | null;
}

export interface DurableRateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  count: number;
  resetAt?: string;
  degraded?: boolean;
  limitedBy?: 'durable_rpc' | 'emergency_memory';
  failureCategory?: DurableRateLimitFailureCategory;
}

type EmergencyBucket = {
  count: number;
  resetAt: string;
  limit: number;
};

const EMERGENCY_DAILY_LIMIT = 25;
const EMERGENCY_SHORT_WINDOW_LIMIT = 5;

function getEmergencyStore(): Map<string, EmergencyBucket> {
  const globalKey = '__manatapEmergencyRateLimitStore';
  const existing = (globalThis as Record<string, unknown>)[globalKey];
  if (existing instanceof Map) {
    return existing as Map<string, EmergencyBucket>;
  }
  const created = new Map<string, EmergencyBucket>();
  (globalThis as Record<string, unknown>)[globalKey] = created;
  return created;
}

function inferIdentity(keyHash: string, options?: DurableRateLimitOptions): DurableRateLimitIdentity {
  if (options?.identity) return options.identity;
  if (keyHash.startsWith('guest:')) return 'guest';
  if (keyHash.startsWith('user:')) return 'free';
  return 'anonymous';
}

function computeResetAt(windowDays: number): string {
  const resetDate = new Date();
  if (windowDays >= 1) {
    resetDate.setDate(resetDate.getDate() + 1);
    resetDate.setHours(0, 0, 0, 0);
  } else {
    resetDate.setTime(resetDate.getTime() + windowDays * 24 * 60 * 60 * 1000);
  }
  return resetDate.toISOString();
}

function buildDeniedResult(
  maxRequests: number,
  resetAt: string,
  failureCategory?: DurableRateLimitFailureCategory,
): DurableRateLimitResult {
  return {
    allowed: false,
    remaining: 0,
    limit: maxRequests,
    count: 0,
    resetAt,
    degraded: !!failureCategory,
    limitedBy: 'durable_rpc',
    failureCategory,
  };
}

function logLimiterFailure(input: {
  routePath: string;
  identity: DurableRateLimitIdentity;
  failureCategory: DurableRateLimitFailureCategory;
  usedEmergencyFallback: boolean;
  verifiedUserId?: string | null;
  details?: string;
}): void {
  console.error(
    '[durable-rate-limit]',
    JSON.stringify({
      route: input.routePath,
      userType: input.identity,
      failureCategory: input.failureCategory,
      usedEmergencyFallback: input.usedEmergencyFallback,
      hasVerifiedIdentity: !!input.verifiedUserId,
      details: input.details ?? null,
      timestamp: new Date().toISOString(),
    }),
  );
}

function tryEmergencyFallback(input: {
  routePath: string;
  identity: DurableRateLimitIdentity;
  verifiedUserId?: string | null;
  maxRequests: number;
  windowDays: number;
  resetAt: string;
  failureCategory: DurableRateLimitFailureCategory;
  details?: string;
}): DurableRateLimitResult | null {
  if (input.identity !== 'pro' || !input.verifiedUserId) {
    logLimiterFailure({
      routePath: input.routePath,
      identity: input.identity,
      failureCategory: input.failureCategory,
      usedEmergencyFallback: false,
      verifiedUserId: input.verifiedUserId,
      details: input.details,
    });
    return null;
  }

  const emergencyLimit = Math.min(
    input.maxRequests,
    input.windowDays >= 1 ? EMERGENCY_DAILY_LIMIT : EMERGENCY_SHORT_WINDOW_LIMIT,
  );
  const store = getEmergencyStore();
  const storeKey = `${input.routePath}:${input.verifiedUserId}:${input.windowDays >= 1 ? 'daily' : `window:${input.windowDays}`}`;
  const existing = store.get(storeKey);
  const now = Date.now();
  const expired = !existing || Date.parse(existing.resetAt) <= now;
  const bucket: EmergencyBucket = expired
    ? { count: 0, resetAt: input.resetAt, limit: emergencyLimit }
    : existing;

  const nextCount = bucket.count + 1;
  bucket.limit = emergencyLimit;
  bucket.resetAt = expired ? input.resetAt : bucket.resetAt;

  if (nextCount > emergencyLimit) {
    store.set(storeKey, bucket);
    logLimiterFailure({
      routePath: input.routePath,
      identity: input.identity,
      failureCategory: input.failureCategory,
      usedEmergencyFallback: false,
      verifiedUserId: input.verifiedUserId,
      details: input.details,
    });
    return {
      allowed: false,
      remaining: 0,
      limit: emergencyLimit,
      count: bucket.count,
      resetAt: bucket.resetAt,
      degraded: true,
      limitedBy: 'emergency_memory',
      failureCategory: input.failureCategory,
    };
  }

  bucket.count = nextCount;
  store.set(storeKey, bucket);
  logLimiterFailure({
    routePath: input.routePath,
    identity: input.identity,
    failureCategory: input.failureCategory,
    usedEmergencyFallback: true,
    verifiedUserId: input.verifiedUserId,
    details: input.details,
  });
  return {
    allowed: true,
    remaining: Math.max(0, emergencyLimit - nextCount),
    limit: emergencyLimit,
    count: nextCount,
    resetAt: bucket.resetAt,
    degraded: true,
    limitedBy: 'emergency_memory',
    failureCategory: input.failureCategory,
  };
}

export function resetEmergencyRateLimitFallbackForTests(): void {
  getEmergencyStore().clear();
}

export async function checkDurableRateLimit(
  supabase: SupabaseClient,
  keyHash: string,
  routePath: string,
  maxRequests: number,
  windowDays: number = 1,
  options?: DurableRateLimitOptions,
): Promise<DurableRateLimitResult> {
  const identity = inferIdentity(keyHash, options);
  const resetAt = computeResetAt(windowDays);

  try {
    const db = options?.serviceClientOverride ?? getServiceRoleClient();

    if (!db) {
      const fallback = tryEmergencyFallback({
        routePath,
        identity,
        verifiedUserId: options?.verifiedUserId ?? null,
        maxRequests,
        windowDays,
        resetAt,
        failureCategory: 'missing_service_role',
        details: 'service-role client unavailable',
      });
      return fallback ?? buildDeniedResult(maxRequests, resetAt, 'missing_service_role');
    }

    const today = new Date().toISOString().split('T')[0];

    try {
      const { data: rpcResult, error: rpcError } = await db.rpc('increment_rate_limit', {
        p_key_hash: keyHash,
        p_route_path: routePath,
        p_date: today,
        p_max_requests: maxRequests,
      });

      if (rpcError) {
        const fallback = tryEmergencyFallback({
          routePath,
          identity,
          verifiedUserId: options?.verifiedUserId ?? null,
          maxRequests,
          windowDays,
          resetAt,
          failureCategory: 'rpc_error',
          details: rpcError.message,
        });
        return fallback ?? buildDeniedResult(maxRequests, resetAt, 'rpc_error');
      }

      if (!Array.isArray(rpcResult) || rpcResult.length === 0) {
        const fallback = tryEmergencyFallback({
          routePath,
          identity,
          verifiedUserId: options?.verifiedUserId ?? null,
          maxRequests,
          windowDays,
          resetAt,
          failureCategory: 'rpc_unexpected_response',
          details: 'empty or invalid rpc response',
        });
        return fallback ?? buildDeniedResult(maxRequests, resetAt, 'rpc_unexpected_response');
      }

      const result = rpcResult[0] as {
        allowed?: boolean | null;
        remaining?: number | null;
        limit_count?: number | null;
        count_after?: number | null;
      };

      if (!result.allowed) {
        try {
          const { logRateLimitTriggered } = await import('./security-events');
          logRateLimitTriggered(
            keyHash,
            routePath,
            maxRequests,
            result.count_after ?? 0,
            identity !== 'pro' && identity !== 'free',
          );
        } catch {}
        try {
          const { logOpsEvent } = await import('@/lib/ops-events');
          await logOpsEvent(db, {
            event_type: 'ops_rate_limit_hit',
            route: routePath,
            status: 'ok',
            reason: 'daily_limit',
            limit: maxRequests,
            count: result.count_after ?? 0,
            key_prefix: keyHash.substring(0, 12),
          });
        } catch {}
      }

      return {
        allowed: result.allowed ?? false,
        remaining: result.remaining ?? 0,
        limit: result.limit_count ?? maxRequests,
        count: result.count_after ?? 0,
        resetAt,
        limitedBy: 'durable_rpc',
      };
    } catch (rpcException) {
      const details = rpcException instanceof Error ? rpcException.message : String(rpcException ?? 'unknown');
      const fallback = tryEmergencyFallback({
        routePath,
        identity,
        verifiedUserId: options?.verifiedUserId ?? null,
        maxRequests,
        windowDays,
        resetAt,
        failureCategory: 'rpc_exception',
        details,
      });
      return fallback ?? buildDeniedResult(maxRequests, resetAt, 'rpc_exception');
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error ?? 'unknown');
    const fallback = tryEmergencyFallback({
      routePath,
      identity,
      verifiedUserId: options?.verifiedUserId ?? null,
      maxRequests,
      windowDays,
      resetAt,
      failureCategory: 'exception',
      details,
    });
    return fallback ?? buildDeniedResult(maxRequests, resetAt, 'exception');
  }
}

/**
 * Cleanup old rate limit records (older than specified days)
 * Should be called by a cron job.
 */
export async function cleanupOldRateLimits(
  supabase: SupabaseClient,
  retentionDays: number = 7,
): Promise<{ deleted: number }> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoff = cutoffDate.toISOString().split('T')[0];

    const db = getServiceRoleClient() ?? supabase;

    const { count, error } = await db.from('api_usage_rate_limits').delete().lt('date', cutoff);

    if (error) {
      console.error('[cleanupOldRateLimits] Failed:', error);
      return { deleted: 0 };
    }

    return { deleted: count || 0 };
  } catch (error) {
    console.error('[cleanupOldRateLimits] Exception:', error);
    return { deleted: 0 };
  }
}
