import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server-supabase';
import { appendEmailToConfirmedUrl } from '@/lib/auth/emailVerificationRedirect';
import { captureServer } from '@/lib/server/analytics';

export const runtime = 'nodejs';

/**
 * OAuth + email-verification PKCE callback. Supabase redirects here with ?code=...
 * Exchanges the code for a Supabase session, sets the session via existing server client,
 * then redirects to ?next=... (if present and safe) or /.
 *
 * Email signup uses next=/auth/confirmed?verified=1 (see getEmailSignupRedirectTo).
 *
 * Add to Supabase Auth → URL Configuration → Redirect URLs:
 *   https://www.manatap.ai/auth/callback, http://localhost:3000/auth/callback
 */
const DEFAULT_REDIRECT = '/';

function authErrorCategory(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('code challenge') || normalized.includes('code verifier')) {
    return 'pkce_code_verifier_mismatch';
  }
  if (normalized.includes('expired')) return 'expired_or_invalid_code';
  if (normalized.includes('invalid')) return 'expired_or_invalid_code';
  return 'callback_exchange_failed';
}

async function captureAuthCallbackError(
  req: NextRequest,
  category: string,
  sourcePath: string,
) {
  const visitorId = req.cookies.get('visitor_id')?.value ?? null;
  await captureServer(
    'auth_callback_failed',
    {
      app_surface: 'website',
      source_surface: 'auth',
      source_feature: 'oauth_callback',
      route_path: '/auth/callback',
      source_path: sourcePath,
      auth_error_category: category,
      visitor_id: visitorId,
      logged_in: false,
    },
    visitorId,
  );
}

function safeNext(next: string | null, base: string): string {
  const p = (next ?? '').trim();
  if (!p || !p.startsWith('/') || p.startsWith('//')) return DEFAULT_REDIRECT;
  try {
    const u = new URL(p, base);
    return u.origin === new URL(base).origin ? u.pathname + u.search : DEFAULT_REDIRECT;
  } catch {
    return DEFAULT_REDIRECT;
  }
}

function enrichConfirmedRedirect(next: string, email?: string | null): string {
  return appendEmailToConfirmedUrl(next, email);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const { searchParams } = url;
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next');
  const decodedNext = rawNext ? (() => { try { return decodeURIComponent(rawNext); } catch { return rawNext; } })() : null;
  const cookieVal = req.cookies.get('auth_return_to')?.value ?? null;
  const fromCookie = cookieVal ? (() => { try { return decodeURIComponent(cookieVal); } catch { return cookieVal; } })() : null;
  const next = safeNext(decodedNext || rawNext || fromCookie, url.origin);
  const callbackSourcePath = url.pathname;

  if (!code) {
    await captureAuthCallbackError(req, 'missing_code', callbackSourcePath);
    return NextResponse.redirect(new URL('/', req.url));
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error:', error.message);
      await captureAuthCallbackError(req, authErrorCategory(error.message), callbackSourcePath);
      return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(error.message)}`, req.url));
    }
    const dest = enrichConfirmedRedirect(next, data.session?.user?.email);
    const res = NextResponse.redirect(new URL(dest, req.url));
    res.cookies.set('auth_return_to', '', { path: '/', maxAge: 0 });
    return res;
  } catch (e) {
    console.error('[auth/callback] error:', e);
    await captureAuthCallbackError(req, 'callback_exception', callbackSourcePath);
    return NextResponse.redirect(new URL('/?auth_error=callback_failed', req.url));
  }
}
