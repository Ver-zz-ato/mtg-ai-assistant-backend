import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkDurableRateLimit } from '@/lib/api/durable-rate-limit';
import { checkProStatus } from '@/lib/server-pro-check';
import { hashGuestToken, hashString } from '@/lib/guest-tracking';
import { GUEST_DAILY_FEATURE_LIMIT } from '@/lib/feature-limits';

const FANOUT_FREE_DAILY = 200;
const FANOUT_PRO_DAILY = 2000;

/** Burst rate limit for read-heavy fanout routes (fuzzy match, price snapshot). */
export async function enforceFanoutRateLimit(
  req: NextRequest,
  routePath: string,
): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const isPro = await checkProStatus(user.id);
    const dailyLimit = isPro ? FANOUT_PRO_DAILY : FANOUT_FREE_DAILY;
    const userKeyHash = `user:${await hashString(user.id)}`;
    const rateLimit = await checkDurableRateLimit(supabase, userKeyHash, routePath, dailyLimit, 1, {
      identity: isPro ? 'pro' : 'free',
      verifiedUserId: isPro ? user.id : null,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({
        ok: false,
        code: 'RATE_LIMIT_DAILY',
        error: 'Too many requests today. Try again later.',
        resetAt: rateLimit.resetAt,
      }, { status: 429 });
    }
    return null;
  }

  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const guestToken = cookieStore.get('guest_session_token')?.value;
  const keyHash = guestToken
    ? `guest:${await hashGuestToken(guestToken)}`
    : `ip:${await hashString((req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown')}`;
  const rateLimit = await checkDurableRateLimit(supabase, keyHash, routePath, GUEST_DAILY_FEATURE_LIMIT, 1, {
    identity: keyHash.startsWith('guest:') ? 'guest' : 'anonymous',
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({
      ok: false,
      code: 'RATE_LIMIT_DAILY',
      error: 'Too many requests today. Sign in for higher limits.',
      resetAt: rateLimit.resetAt,
    }, { status: 429 });
  }
  return null;
}
