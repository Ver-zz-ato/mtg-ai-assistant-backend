/**
 * Shared helper to read guest session token from request.
 * Used by chat routes for cookie + header support (mobile-friendly).
 *
 * Precedence:
 * 1. X-Guest-Session-Token header (for mobile clients)
 * 2. guest_session_token cookie (for website)
 */

import type { NextRequest } from 'next/server';

/** Canonical header name for guest token (HTTP headers are case-insensitive). */
const GUEST_TOKEN_HEADER = 'X-Guest-Session-Token';
const GUEST_TOKEN_COOKIE = 'guest_session_token';

export type GuestTokenSource = 'header' | 'cookie' | 'none';

export interface GetGuestTokenResult {
  guestToken: string | null;
  source: GuestTokenSource;
}

/**
 * Read guest token from request.
 * Prefers header (mobile) over cookie (website).
 * Does not verify the token; caller should use verifyGuestToken() if needed.
 */
export async function getGuestToken(req: NextRequest): Promise<GetGuestTokenResult> {
  const headerToken = req.headers.get(GUEST_TOKEN_HEADER)?.trim();
  if (headerToken) {
    return { guestToken: headerToken, source: 'header' };
  }

  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(GUEST_TOKEN_COOKIE)?.value ?? null;
  if (cookieToken) {
    return { guestToken: cookieToken, source: 'cookie' };
  }

  return { guestToken: null, source: 'none' };
}
