import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server-supabase';

export const runtime = 'nodejs';

/**
 * OAuth callback for Google (and other providers). Supabase redirects here with ?code=...
 * Exchanges the code for a Supabase session, sets the session via existing server client,
 * then redirects to ?next=... (if present and safe) or /profile.
 *
 * Add to Supabase Auth → URL Configuration → Redirect URLs:
 *   https://manatap.ai/auth/callback, http://localhost:3000/auth/callback
 */
const DEFAULT_REDIRECT = '/profile';

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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const { searchParams } = url;
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'), url.origin);

  if (!code) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error:', error.message);
      return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(error.message)}`, req.url));
    }
    return NextResponse.redirect(new URL(next, req.url));
  } catch (e) {
    console.error('[auth/callback] error:', e);
    return NextResponse.redirect(new URL('/?auth_error=callback_failed', req.url));
  }
}
