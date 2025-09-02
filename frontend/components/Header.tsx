'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function Header() {
  const supabase = createBrowserSupabaseClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sessionUser, setSessionUser] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSessionUser(data.user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setSessionUser(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert(error.message);
      return;
    }
    window.location.reload();
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  return (
    <header className="w-full border-b">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-semibold">
          MTG Coach
        </Link>

        <nav className="flex items-center gap-3">
          <Link href="/my-decks" className="text-sm hover:underline">
            My Decks
          </Link>

          {sessionUser ? (
            <>
              <span className="text-xs opacity-70">{sessionUser}</span>
              <button
                onClick={signOut}
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5"
              >
                Sign out
              </button>
            </>
          ) : (
            <form onSubmit={signIn} className="flex items-center gap-2">
              <input
                type="email"
                placeholder="email"
                className="rounded-lg border px-2 py-1 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="password"
                className="rounded-lg border px-2 py-1 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="submit"
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5"
              >
                Sign in
              </button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}
