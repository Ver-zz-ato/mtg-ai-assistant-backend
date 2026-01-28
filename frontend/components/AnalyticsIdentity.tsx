'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { hasConsent, identify, alias, reset, getVisitorIdFromCookie } from '@/lib/ph';

function isPostHogReady(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).posthog?._loaded;
}

function authType(user: { created_at?: string }): 'signup_completed' | 'login_completed' {
  const created = user?.created_at ? new Date(user.created_at).getTime() : 0;
  const now = Date.now();
  const within5min = now - created <= 5 * 60 * 1000;
  return within5min ? 'signup_completed' : 'login_completed';
}

function authMethodAndProvider(user: { app_metadata?: { provider?: string }; identities?: Array<{ provider?: string }> }): { method: 'email' | 'oauth'; provider: string | null } {
  const p = user?.app_metadata?.provider ?? user?.identities?.[0]?.provider ?? 'email';
  if (p === 'email') return { method: 'email', provider: null };
  return { method: 'oauth', provider: p };
}

/**
 * Syncs PostHog distinct_id with visitor_id (anon) or user.id (auth).
 * Identifies with visitor_id when anonymous; identifies user.id and aliases visitor_id on login.
 * On logout, resets then identifies visitor_id again when available.
 * Fires signup_completed / login_completed via POST /api/analytics/auth-event on SIGNED_IN (no consent required).
 */
export default function AnalyticsIdentity() {
  const { user } = useAuth();
  const lastUserId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onReady = () => setReady(true);
    if (isPostHogReady()) setReady(true);
    window.addEventListener('analytics:ready', onReady);
    return () => window.removeEventListener('analytics:ready', onReady);
  }, []);

  useEffect(() => {
    if (!ready || !isPostHogReady()) return;
    const visitorId = getVisitorIdFromCookie();
    const consent = hasConsent();

    if (user) {
      const isNewUser = lastUserId.current === null;
      lastUserId.current = user.id;

      if (consent) {
        identify(user.id, { $set: { email: user.email ?? undefined } });
        if (visitorId) alias(visitorId);
      }

      if (isNewUser) {
        const type = authType(user);
        const { method, provider } = authMethodAndProvider(user);
        fetch('/api/analytics/auth-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            method,
            provider,
            source_path: typeof window !== 'undefined' ? window.location.pathname : null,
            visitor_id: visitorId,
          }),
        }).catch(() => {});
      }
    } else {
      const hadUser = lastUserId.current !== null;
      lastUserId.current = null;
      if (consent) {
        if (hadUser) reset();
        if (visitorId) identify(visitorId);
      }
    }
  }, [ready, user?.id, user?.email, user]);

  return null;
}
