'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

/** Same targets as `app/auth/confirm/route.ts` for failed / error-only hash fragments */
const RECOVERY_ERROR_REDIRECT = '/account/update-password?error=invalid_or_expired';
const OTHER_ERROR_REDIRECT = '/?auth_error=invalid_or_expired';

/**
 * Mirrors `usesEmailConfirmationSuccessPage` in `app/auth/confirm/route.ts`:
 * recovery + invite use different success paths; everything else uses /auth/confirmed on the server route.
 */
function usesEmailConfirmationSuccessPage(type: string | null): boolean {
  if (!type) return false;
  if (type === 'recovery') return false;
  if (type === 'invite') return false;
  return true;
}

function getDestination(type: string | null): string {
  if (type === 'recovery') return '/account/update-password';
  if (usesEmailConfirmationSuccessPage(type)) return '/auth/confirmed?verified=1';
  return '/';
}

function getErrorRedirect(type: string | null): string {
  return type === 'recovery' ? RECOVERY_ERROR_REDIRECT : OTHER_ERROR_REDIRECT;
}

/**
 * Remove the fragment from the visible URL without navigation, preserving pathname + search and
 * current history state (back button stays sensible). Call only after extracting needed values from
 * the hash into locals — we clear *before* setSession so a React remount cannot re-read the same
 * tokens from window.location (ref resets on remount; hash removal does not).
 */
function stripAuthHashFromUrl(): void {
  if (typeof window === 'undefined') return;
  if (!window.location.hash) return;
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, document.title, pathname + search);
}

/**
 * Supabase email links using {{ .ConfirmationURL }} often open in the browser with tokens in the
 * URL hash (#access_token=…&refresh_token=…&type=…). This is not sent to the server and was a no-op
 * on web until we call setSession here. Does not interact with /auth/confirm?token_hash=… (PKCE / OTP).
 */
export default function HashAuthCallbackHandler() {
  const router = useRouter();
  const finished = useRef(false);

  useEffect(() => {
    if (finished.current) return;
    if (typeof window === 'undefined') return;

    const raw = window.location.hash;
    if (!raw || raw.length <= 1) return;

    const params = new URLSearchParams(raw.slice(1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    const type = params.get('type');
    const error = params.get('error');

    if (error) {
      finished.current = true;
      stripAuthHashFromUrl();
      router.replace(getErrorRedirect(type));
      return;
    }

    if (!access_token || !refresh_token) return;

    finished.current = true;
    stripAuthHashFromUrl();

    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { error: sessErr } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (sessErr) {
          console.warn('[hash-auth] setSession failed:', sessErr.message);
          router.replace(getErrorRedirect(type));
          return;
        }
        router.replace(getDestination(type));
      } catch (e) {
        console.warn('[hash-auth] setSession error:', e);
        router.replace(getErrorRedirect(type));
      }
    })();
  }, [router]);

  return null;
}
