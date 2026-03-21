import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server-supabase';
import type { EmailOtpType } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const DEFAULT_NEXT = '/account/update-password';
const ERROR_REDIRECT = '/account/update-password?error=invalid_or_expired';

function safeNext(next: string | null, base: string): string {
  const p = (next ?? '').trim();
  if (!p || !p.startsWith('/') || p.startsWith('//')) return DEFAULT_NEXT;
  try {
    const u = new URL(p, base);
    return u.origin === new URL(base).origin ? u.pathname + u.search : DEFAULT_NEXT;
  } catch {
    return DEFAULT_NEXT;
  }
}

/**
 * Token-hash confirm route for password reset (and other OTP flows).
 * Supabase recovery email template should link to:
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/account/update-password
 *
 * Verify the token via verifyOtp, then redirect to next (or /account/update-password).
 * On failure, redirect to /account/update-password?error=invalid_or_expired.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const { searchParams } = url;
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const rawNext = searchParams.get('next');
  const next = safeNext(rawNext, url.origin);

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL(ERROR_REDIRECT, req.url));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) {
      console.warn('[auth/confirm] verifyOtp error:', error.message);
      return NextResponse.redirect(new URL(ERROR_REDIRECT, req.url));
    }
    return NextResponse.redirect(new URL(next, req.url));
  } catch (e) {
    console.error('[auth/confirm] error:', e);
    return NextResponse.redirect(new URL(ERROR_REDIRECT, req.url));
  }
}
