'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { hasConsent, identify, alias, reset, getVisitorIdFromCookie } from '@/lib/ph';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const AUTH_RECORDED_KEY = 'analytics:auth_recorded';

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

function sessionStorageKey(userId: string, session: { refresh_token?: string; access_token?: string }): string {
  const token = (session.refresh_token || session.access_token || '').slice(0, 32);
  return `${AUTH_RECORDED_KEY}:${userId}:${token || 'unknown'}`;
}

function hasRecordedAuthForSession(userId: string, session: { refresh_token?: string; access_token?: string }): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(sessionStorageKey(userId, session)) === '1';
  } catch {
    return false;
  }
}

function setRecordedAuthForSession(userId: string, session: { refresh_token?: string; access_token?: string }): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(sessionStorageKey(userId, session), '1');
  } catch {}
}

async function fireAuthEventIfNotRecorded(user: { id: string; created_at?: string; app_metadata?: { provider?: string }; identities?: Array<{ provider?: string }> }, session: { refresh_token?: string; access_token?: string }): Promise<boolean> {
  if (hasRecordedAuthForSession(user.id, session)) return false;
  const type = authType(user);
  const { method, provider } = authMethodAndProvider(user);
  const visitorId = getVisitorIdFromCookie();
  await fetch('/api/analytics/auth-event', {
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
  setRecordedAuthForSession(user.id, session);
  return true;
}

/**
 * Syncs PostHog distinct_id with visitor_id (anon) or user.id (auth).
 * Fires signup_completed / login_completed via /api/analytics/auth-event.
 * First-load session check: on mount we call getSession(); if session exists and we haven't
 * recorded auth for this session yet, we fire auth-event and set a localStorage flag so we
 * don't miss events when there's no SIGNED_IN transition (e.g. session already present on load).
 */
export default function AnalyticsIdentity() {
  const { user } = useAuth();
  const lastUserId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const mountFired = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onReady = () => setReady(true);
    if (isPostHogReady()) setReady(true);
    window.addEventListener('analytics:ready', onReady);
    return () => window.removeEventListener('analytics:ready', onReady);
  }, []);

  // First-load session check: fire auth-event if session exists and we haven't recorded it yet (no callback page reliability)
  useEffect(() => {
    if (typeof window === 'undefined' || !ready) return;
    if (mountFired.current) return;
    mountFired.current = true;
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.user) return;
      await fireAuthEventIfNotRecorded(session.user, session);
    })();
    return () => { cancelled = true; };
  }, [ready]);

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
        let cancelled = false;
        (async () => {
          const supabase = createBrowserSupabaseClient();
          const { data: { session } } = await supabase.auth.getSession();
          if (cancelled || !session?.user || session.user.id !== user.id) return;
          const fired = await fireAuthEventIfNotRecorded(user, session);
          if (fired) setRecordedAuthForSession(user.id, session);
        })();
        return () => { cancelled = true; };
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
