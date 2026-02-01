/**
 * Shared utility for server-side guest message limit checking
 * Used by both /api/chat and /api/chat/stream routes
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { GUEST_MESSAGE_LIMIT } from '@/lib/limits';

interface GuestLimitResult {
  allowed: boolean;
  count: number;
  tokenHash?: string;
}

/**
 * Check if guest user has exceeded message limit (server-side enforcement)
 */
export async function checkGuestMessageLimit(
  supabase: SupabaseClient,
  token: string | null,
  ip: string,
  userAgent: string
): Promise<GuestLimitResult> {
  if (!token) {
    // No token provided - deny access (should have been created by middleware)
    return { allowed: false, count: 0 };
  }

  try {
    const { hashGuestToken, hashString } = await import('@/lib/guest-tracking');
    const tokenHash = await hashGuestToken(token);
    const ipHash = await hashString(ip);
    const uaHash = await hashString(userAgent);

    // Check existing session
    const { data: existing, error: fetchError } = await supabase
      .from('guest_sessions')
      .select('message_count, expires_at')
      .eq('token_hash', tokenHash)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine for new sessions
      console.error('[checkGuestMessageLimit] Database error:', fetchError);
      // Fail closed - deny on error
      return { allowed: false, count: 0, tokenHash };
    }

    const messageCount = existing?.message_count || 0;
    const expiresAt = existing?.expires_at ? new Date(existing.expires_at) : null;
    const now = new Date();

    // Check if expired
    if (expiresAt && expiresAt < now) {
      // Session expired - delete and create new
      await supabase.from('guest_sessions').delete().eq('token_hash', tokenHash);
      const { error: insertError } = await supabase.from('guest_sessions').insert({
        token_hash: tokenHash,
        message_count: 1,
        ip_hash: ipHash,
        user_agent_hash: uaHash,
        created_at: now.toISOString(),
        last_message_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      });

      if (insertError) {
        console.error('[checkGuestMessageLimit] Failed to create new session:', insertError);
        return { allowed: false, count: 0, tokenHash };
      }

      return { allowed: true, count: 1, tokenHash };
    }

    // Check limit
    if (messageCount >= GUEST_MESSAGE_LIMIT) {
      return { allowed: false, count: messageCount, tokenHash };
    }

    // Increment counter
    const { error: updateError } = await supabase
      .from('guest_sessions')
      .upsert({
        token_hash: tokenHash,
        message_count: messageCount + 1,
        ip_hash: ipHash,
        user_agent_hash: uaHash,
        last_message_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, {
        onConflict: 'token_hash',
      });

    if (updateError) {
      console.error('[checkGuestMessageLimit] Failed to update session:', updateError);
      // Fail closed
      return { allowed: false, count: messageCount, tokenHash };
    }

    return { allowed: true, count: messageCount + 1, tokenHash };
  } catch (error) {
    console.error('[checkGuestMessageLimit] Exception:', error);
    // Fail closed - deny on error
    return { allowed: false, count: 0 };
  }
}

export { GUEST_MESSAGE_LIMIT };
