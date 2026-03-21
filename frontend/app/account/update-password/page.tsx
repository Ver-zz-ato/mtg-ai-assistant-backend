'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';

type PageState = 'loading' | 'invalid' | 'form' | 'success' | 'error';

function parseHashParams(hash: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!hash || !hash.startsWith('#')) return params;
  const search = hash.slice(1);
  search.split('&').forEach((pair) => {
    const [k, v] = pair.split('=').map(decodeURIComponent);
    if (k && v) params[k] = v;
  });
  return params;
}

function hasRecoveryTokens(hash: string): boolean {
  const p = parseHashParams(hash);
  return !!(p.type === 'recovery' && (p.access_token || p.refresh_token));
}

function UpdatePasswordContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitError, setSubmitError] = useState('');

  const validateAndConsumeRecovery = useCallback(async (): Promise<Session | null> => {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash;
    if (!hasRecoveryTokens(hash)) return null;

    const supabase = createBrowserSupabaseClient();
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('[update-password] getSession error:', error.message);
        return null;
      }
      if (session) {
        const params = parseHashParams(hash);
        if (params.type !== 'recovery') return null;
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return session;
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (typeof window === 'undefined') return;

      if (searchParams.get('error') === 'invalid_or_expired') {
        setState('invalid');
        return;
      }

      const hash = window.location.hash;

      if (!hash) {
        const supabase = createBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) {
          setState('form');
        } else {
          setState('invalid');
        }
        return;
      }

      if (!hasRecoveryTokens(hash)) {
        setState('invalid');
        return;
      }

      const session = await validateAndConsumeRecovery();
      if (cancelled) return;

      if (session) {
        setState('form');
      } else {
        setState('invalid');
      }
    }

    run();
    return () => { cancelled = true; };
  }, [validateAndConsumeRecovery, searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');

    if (password.length < 6) {
      setSubmitError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match');
      return;
    }

    setState('loading');
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setState('form');
        setErrorMessage(error.message);
        setSubmitError(error.message);
        return;
      }
      setState('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password';
      setState('error');
      setErrorMessage(msg);
    }
  }

  const cardClass = 'bg-neutral-900 text-white rounded-lg shadow-xl border border-neutral-700 w-full max-w-sm p-6';

  if (state === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className={cardClass}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white mx-auto mb-4" />
            <div className="font-semibold">Validating reset link...</div>
            <div className="text-sm text-neutral-400 mt-1">Please wait</div>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className={cardClass}>
          <div className="text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold mb-2">Invalid or expired link</h1>
            <p className="text-neutral-400 text-sm mb-6">
              This password reset link is invalid or has expired. Request a new one.
            </p>
            <Link
              href="/"
              className="block w-full py-3 px-4 rounded bg-white text-black font-medium hover:bg-neutral-100 text-center"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'form') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className={cardClass}>
          <h1 className="text-xl font-bold mb-2">Set new password</h1>
          <p className="text-neutral-400 text-sm mb-4">
            Enter your new password below.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              className="w-full bg-neutral-950 text-white border border-neutral-700 rounded px-3 py-2"
              autoComplete="new-password"
              minLength={6}
              required
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full bg-neutral-950 text-white border border-neutral-700 rounded px-3 py-2"
              autoComplete="new-password"
              minLength={6}
              required
            />
            {submitError && (
              <p className="text-red-400 text-sm">{submitError}</p>
            )}
            <button
              type="submit"
              className="w-full py-3 px-4 rounded bg-white text-black font-medium hover:bg-neutral-100"
            >
              Update password
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className={cardClass}>
          <div className="text-center">
            <div className="text-4xl mb-4">✓</div>
            <h1 className="text-xl font-bold mb-2">Password updated</h1>
            <p className="text-neutral-400 text-sm mb-6">
              Your password has been changed. You can now sign in with your new password.
            </p>
            <Link
              href="/"
              className="block w-full py-3 px-4 rounded bg-white text-black font-medium hover:bg-neutral-100 text-center"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className={cardClass}>
        <div className="text-center">
          <div className="text-4xl mb-4">❌</div>
          <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
          <p className="text-neutral-400 text-sm mb-6">
            {errorMessage || 'Failed to update password. Please try again.'}
          </p>
          <Link
            href="/"
            className="block w-full py-3 px-4 rounded bg-white text-black font-medium hover:bg-neutral-100 text-center"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="bg-neutral-900 text-white rounded-lg shadow-xl border border-neutral-700 w-full max-w-sm p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white mx-auto mb-4" />
            <div className="font-semibold">Loading...</div>
          </div>
        </div>
      </div>
    }>
      <UpdatePasswordContent />
    </Suspense>
  );
}
