'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

const CARD =
  'bg-neutral-900 text-white rounded-lg shadow-xl border border-neutral-700 w-full max-w-md p-6';

function clientSafeNext(next: string | null, origin: string, fallback: string): string {
  const p = (next ?? '').trim();
  if (!p || !p.startsWith('/') || p.startsWith('//')) return fallback;
  try {
    const u = new URL(p, origin);
    return u.origin === origin ? u.pathname + u.search : fallback;
  } catch {
    return fallback;
  }
}

function ConfirmedInner() {
  const searchParams = useSearchParams();
  const { user, session, loading: authLoading } = useAuth();

  const verified = searchParams.get('verified') === '1';
  const rawNext = searchParams.get('next');
  const emailFromQuery = searchParams.get('email');
  const resendTypeRaw = searchParams.get('resend_type');
  const resendType = resendTypeRaw === 'email_change' ? 'email_change' : 'signup';

  const [emailInput, setEmailInput] = useState('');
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resendMessage, setResendMessage] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);

  useEffect(() => {
    setEmailInput(emailFromQuery?.trim() || '');
  }, [emailFromQuery]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const ms = Math.max(0, cooldownUntil - Date.now());
    const id = setTimeout(() => setCooldownUntil(0), ms);
    return () => clearTimeout(id);
  }, [cooldownUntil]);

  /** Re-render once per second while cooldown active so the wait label updates */
  const [, bump] = useState(0);
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => bump((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const continueHref =
    origin && rawNext ? clientSafeNext(rawNext, origin, '/') : '/';

  const handleResend = useCallback(async () => {
    const email = emailInput.trim();
    if (!email || !email.includes('@')) {
      setResendStatus('error');
      setResendMessage('Enter a valid email address.');
      return;
    }
    if (cooldownUntil > Date.now()) return;

    setResendStatus('sending');
    setResendMessage('');
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.resend({
        type: resendType,
        email,
      });
      if (error) {
        setResendStatus('error');
        setResendMessage(error.message);
        return;
      }
      setResendStatus('sent');
      setResendMessage('If an account needs confirmation, we sent another email.');
      setCooldownUntil(Date.now() + 60_000);
    } catch (e: unknown) {
      setResendStatus('error');
      setResendMessage(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }, [emailInput, resendType, cooldownUntil]);

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className={CARD}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white mx-auto mb-4" />
            <div className="font-semibold">Checking your session…</div>
            <div className="text-sm text-neutral-400 mt-1">One moment</div>
          </div>
        </div>
      </div>
    );
  }

  /** Direct visit without completing the confirm redirect */
  if (!verified) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className={CARD}>
          <h1 className="text-xl font-bold mb-2">Email confirmation</h1>
          <p className="text-neutral-400 text-sm mb-4">
            This page is shown after you open the verification link from your email. If you arrived here by
            mistake, you can go home or sign in.
          </p>
          {user ? (
            <Link
              href="/"
              className="block w-full py-3 px-4 rounded bg-white text-black font-medium hover:bg-neutral-100 text-center"
            >
              Continue to ManaTap
            </Link>
          ) : (
            <Link
              href="/"
              className="block w-full py-3 px-4 rounded bg-white text-black font-medium hover:bg-neutral-100 text-center"
            >
              Back to home
            </Link>
          )}
        </div>
      </div>
    );
  }

  const signedIn = !!session?.user;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className={CARD}>
        <div className="text-center mb-4">
          <div className="text-4xl mb-2" aria-hidden>
            ✓
          </div>
          <h1 className="text-xl font-bold mb-1">Email confirmed</h1>
          <p className="text-neutral-400 text-sm">
            Your email address has been verified successfully. You can now continue to ManaTap.
          </p>
        </div>

        {signedIn ? (
          <div className="space-y-3">
            <p className="text-sm text-neutral-300 text-center">You&apos;re signed in.</p>
            <Link
              href={continueHref}
              className="block w-full py-3 px-4 rounded bg-white text-black font-medium hover:bg-neutral-100 text-center"
            >
              {rawNext ? 'Continue' : 'Go to home'}
            </Link>
            <Link href="/my-decks" className="block text-center text-sm text-emerald-400 hover:underline">
              Open my decks
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-300 text-center">
              You&apos;re not signed in yet. Sign in with the email and password you used to register.
            </p>
            <Link
              href="/"
              className="block w-full py-3 px-4 rounded bg-white text-black font-medium hover:bg-neutral-100 text-center"
            >
              Sign in
            </Link>
          </div>
        )}

        {!signedIn ? (
          <div className="mt-8 pt-6 border-t border-neutral-700">
            <p className="text-xs text-neutral-500 mb-2 text-center">
              Didn&apos;t get the email or need a new confirmation link?
            </p>
            <label className="block text-xs text-neutral-400 mb-1" htmlFor="resend-email">
              Email
            </label>
            <input
              id="resend-email"
              type="email"
              autoComplete="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-neutral-950 text-white border border-neutral-700 rounded px-3 py-2 text-sm mb-2"
            />
            <button
              type="button"
              onClick={handleResend}
              disabled={resendStatus === 'sending' || cooldownUntil > Date.now()}
              className="w-full py-2 px-3 rounded border border-neutral-600 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
            >
              {resendStatus === 'sending'
                ? 'Sending…'
                : cooldownUntil > Date.now()
                  ? `Wait ${Math.ceil((cooldownUntil - Date.now()) / 1000)}s`
                  : 'Resend confirmation email'}
            </button>
            {resendMessage ? (
              <p
                className={`text-xs mt-2 text-center ${resendStatus === 'error' ? 'text-red-400' : 'text-emerald-400/90'}`}
              >
                {resendMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AuthConfirmedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <div className={CARD}>
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white mx-auto mb-4" />
              <div className="font-semibold">Loading…</div>
            </div>
          </div>
        </div>
      }
    >
      <ConfirmedInner />
    </Suspense>
  );
}
