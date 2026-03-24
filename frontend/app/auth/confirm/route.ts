import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server-supabase';
import type { EmailOtpType } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const RECOVERY_DEFAULT_NEXT = '/account/update-password';
const RECOVERY_ERROR_REDIRECT = '/account/update-password?error=invalid_or_expired';
const OTHER_DEFAULT_NEXT = '/';
const OTHER_ERROR_REDIRECT = '/?auth_error=invalid_or_expired';

const RECOVERY_TYPES: EmailOtpType[] = ['recovery'];

function getDefaults(type: EmailOtpType | null) {
  const isRecovery = type && RECOVERY_TYPES.includes(type);
  return {
    defaultNext: isRecovery ? RECOVERY_DEFAULT_NEXT : OTHER_DEFAULT_NEXT,
    errorRedirect: isRecovery ? RECOVERY_ERROR_REDIRECT : OTHER_ERROR_REDIRECT,
  };
}

function safeNext(next: string | null, base: string, defaultNext: string): string {
  const p = (next ?? '').trim();
  if (!p || !p.startsWith('/') || p.startsWith('//')) return defaultNext;
  try {
    const u = new URL(p, base);
    return u.origin === new URL(base).origin ? u.pathname + u.search : defaultNext;
  } catch {
    return defaultNext;
  }
}

/** recovery + invite keep classic redirect; other OTP types use /auth/confirmed */
function usesEmailConfirmationSuccessPage(type: EmailOtpType | null): boolean {
  if (!type) return false;
  if (RECOVERY_TYPES.includes(type)) return false;
  if (type === 'invite') return false;
  return true;
}

function buildConfirmedSuccessUrl(
  req: NextRequest,
  origin: string,
  rawNext: string | null,
  defaultNext: string,
  userEmail: string | null | undefined,
  otpType: EmailOtpType,
): URL {
  const u = new URL('/auth/confirmed', req.url);
  u.searchParams.set('verified', '1');
  const trimmed = (rawNext ?? '').trim();
  if (trimmed) {
    u.searchParams.set('next', safeNext(rawNext, origin, defaultNext));
  }
  if (userEmail) {
    u.searchParams.set('email', userEmail);
  }
  u.searchParams.set('resend_type', otpType === 'email_change' ? 'email_change' : 'signup');
  return u;
}

/**
 * Token-hash confirm route for Supabase OTP flows.
 * Supports: recovery (password reset), email (signup + magic link), invite, email_change, etc.
 *
 * Email templates should link to:
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=...&next=...
 *
 * - type=recovery: default next=/account/update-password, error → /account/update-password?error=invalid_or_expired
 * - type=invite: default next=/, error → /?auth_error=invalid_or_expired
 * - type=email, email_change, signup, magiclink, …: success → /auth/confirmed?verified=1&…, error → /?auth_error=invalid_or_expired
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const { searchParams } = url;
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const rawNext = searchParams.get('next');

  console.log('[auth/confirm] received type =', type);

  const { defaultNext, errorRedirect } = getDefaults(type);
  const next = safeNext(rawNext, url.origin, defaultNext);

  if (!token_hash || !type) {
    console.warn('[auth/confirm] missing token_hash or type');
    return NextResponse.redirect(new URL(errorRedirect, req.url));
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) {
      console.warn('[auth/confirm] verifyOtp failed:', type, error.message);
      return NextResponse.redirect(new URL(errorRedirect, req.url));
    }
    console.log('[auth/confirm] success:', type);

    const userEmail = data.session?.user?.email ?? data.user?.email ?? null;

    if (usesEmailConfirmationSuccessPage(type)) {
      const dest = buildConfirmedSuccessUrl(req, url.origin, rawNext, defaultNext, userEmail, type);
      return NextResponse.redirect(dest);
    }

    return NextResponse.redirect(new URL(next, req.url));
  } catch (e) {
    console.error('[auth/confirm] error:', type, e);
    return NextResponse.redirect(new URL(errorRedirect, req.url));
  }
}
