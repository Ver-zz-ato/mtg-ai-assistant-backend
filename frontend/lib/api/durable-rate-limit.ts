/**
 * Durable Rate Limiting
 * 
 * Database-backed rate limiting that persists across server restarts.
 * Complements in-memory rate limiting for better reliability.
 * 
 * Uses api_usage_rate_limits table to track request counts per user/guest per route per day.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DurableRateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  count: number;
  resetAt?: string; // ISO timestamp when the limit resets (midnight of next day for daily limits)
}

/**
 * Check durable rate limit using database table
 * 
 * @param supabase - Supabase client instance
 * @param keyHash - Hashed identifier (format: "user:userId" or "guest:tokenHash")
 * @param routePath - API route path (e.g., "/api/chat", "/api/deck/analyze")
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowDays - Number of days in the rate limit window (default: 1 for daily limits)
 * @returns Rate limit check result
 */
/**
 * Check durable rate limit using atomic database increment
 * 
 * Uses PostgreSQL RPC function for atomic increment to avoid race conditions.
 * Falls back to non-atomic upsert if RPC is not available (legacy support).
 * 
 * ⚠️ PERFORMANCE: This uses a single atomic RPC call to avoid "SELECT then UPDATE" race conditions.
 * The increment_rate_limit() function performs the check and increment in one database transaction.
 */
export async function checkDurableRateLimit(
  supabase: SupabaseClient,
  keyHash: string,
  routePath: string,
  maxRequests: number,
  windowDays: number = 1
): Promise<DurableRateLimitResult> {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Calculate reset time (midnight of next day for daily limits)
    // For daily limits (windowDays = 1), this is midnight of tomorrow
    // For per-minute limits (windowDays < 1), this is the end of the window
    const resetDate = new Date();
    if (windowDays >= 1) {
      // Daily limit: reset at midnight of next day
      resetDate.setDate(resetDate.getDate() + 1);
      resetDate.setHours(0, 0, 0, 0);
    } else {
      // Per-minute or other short windows: reset at end of window
      resetDate.setTime(resetDate.getTime() + (windowDays * 24 * 60 * 60 * 1000));
    }
    const resetAt = resetDate.toISOString();
    
    // Try atomic RPC function first (requires migration 026_atomic_rate_limit_increment.sql)
    try {
      const { data: rpcResult, error: rpcError } = await supabase.rpc('increment_rate_limit', {
        p_key_hash: keyHash,
        p_route_path: routePath,
        p_date: today,
        p_max_requests: maxRequests,
      });

      if (!rpcError && rpcResult && rpcResult.length > 0) {
        const result = rpcResult[0];
        
        // Log security event if rate limit exceeded
        if (!result.allowed) {
          try {
            const { logRateLimitTriggered } = await import('./security-events');
            logRateLimitTriggered(keyHash, routePath, maxRequests, result.count_after ?? 0, keyHash.startsWith('guest:'));
          } catch (e) {
            // Fail silently if security events not available
          }
        }
        
        return {
          allowed: result.allowed ?? true,
          remaining: result.remaining ?? 0,
          limit: result.limit_count ?? maxRequests,
          count: result.count_after ?? 0,
          resetAt,
        };
      }

      // RPC not available or failed - log and fall back to non-atomic method
      if (rpcError && process.env.NODE_ENV === 'development') {
        console.warn('[checkDurableRateLimit] RPC function not available, using fallback:', rpcError.message);
      }
    } catch (rpcException) {
      // RPC function doesn't exist - fall back to non-atomic upsert
      if (process.env.NODE_ENV === 'development') {
        console.warn('[checkDurableRateLimit] RPC call failed, using fallback method');
      }
    }

    // FALLBACK: Non-atomic method (race condition possible under high load)
    // This is less ideal but works if the RPC function isn't available
    // TODO: Run migration 026_atomic_rate_limit_increment.sql to enable atomic increments
    
    // Check existing record for today
    const { data: existing, error: fetchError } = await supabase
      .from('api_usage_rate_limits')
      .select('request_count, updated_at')
      .eq('key_hash', keyHash)
      .eq('route_path', routePath)
      .eq('date', today)
      .maybeSingle(); // Use maybeSingle to avoid error on no rows

    if (fetchError) {
      console.error('[checkDurableRateLimit] Database error:', fetchError);
      // Fail open - allow request if DB check fails (prevents outages from blocking users)
      const resetDate = new Date();
      resetDate.setDate(resetDate.getDate() + Math.ceil(windowDays));
      resetDate.setHours(0, 0, 0, 0);
      return { allowed: true, remaining: maxRequests, limit: maxRequests, count: 0, resetAt: resetDate.toISOString() };
    }

    const currentCount = existing?.request_count || 0;
    
      // Check if limit exceeded (before increment)
      if (currentCount >= maxRequests) {
        // Log security event for rate limit triggered
        try {
          const { logRateLimitTriggered } = await import('./security-events');
          logRateLimitTriggered(keyHash, routePath, maxRequests, currentCount, keyHash.startsWith('guest:'));
        } catch (e) {
          // Fail silently if security events not available
        }
        
        return {
          allowed: false,
          remaining: 0,
          limit: maxRequests,
          count: currentCount,
          resetAt,
        };
      }

    // Increment counter (or create new record) - NOT ATOMIC (race condition possible)
    const { error: updateError } = await supabase
      .from('api_usage_rate_limits')
      .upsert({
        key_hash: keyHash,
        route_path: routePath,
        date: today,
        request_count: currentCount + 1,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'key_hash,route_path,date',
      });

    if (updateError) {
      console.error('[checkDurableRateLimit] Failed to update rate limit:', updateError);
      // Fail open - allow request if update fails
      return { allowed: true, remaining: maxRequests - currentCount, limit: maxRequests, count: currentCount, resetAt };
    }

    return {
      allowed: true,
      remaining: maxRequests - (currentCount + 1),
      limit: maxRequests,
      count: currentCount + 1,
      resetAt,
    };
  } catch (error) {
    console.error('[checkDurableRateLimit] Exception:', error);
    // Fail open - allow request on error
    const resetDate = new Date();
    resetDate.setDate(resetDate.getDate() + Math.ceil(windowDays));
    resetDate.setHours(0, 0, 0, 0);
    return { allowed: true, remaining: maxRequests, limit: maxRequests, count: 0, resetAt: resetDate.toISOString() };
  }
}

/**
 * Cleanup old rate limit records (older than specified days)
 * Should be called by a cron job
 */
export async function cleanupOldRateLimits(
  supabase: SupabaseClient,
  retentionDays: number = 7
): Promise<{ deleted: number }> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoff = cutoffDate.toISOString().split('T')[0];

    const { count, error } = await supabase
      .from('api_usage_rate_limits')
      .delete()
      .lt('date', cutoff);

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
