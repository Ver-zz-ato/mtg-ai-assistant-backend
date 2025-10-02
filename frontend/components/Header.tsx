'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function Header() {
  const supabase = createBrowserSupabaseClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [avatar, setAvatar] = useState<string>("");
  const [showSignUp, setShowSignUp] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      setSessionUser(u?.email ?? null);
      const md: any = u?.user_metadata || {};
      setDisplayName((md.username || u?.email || "").toString());
      setAvatar((md.avatar || "").toString());
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user as any;
      setSessionUser(u?.email ?? null);
      const md = (u?.user_metadata || {}) as any;
      setDisplayName((md.username || u?.email || "").toString());
      setAvatar((md.avatar || "").toString());
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
          ManaTap AI
        </Link>

        <nav className="flex items-center gap-3">
          {/* Pro badge to the far left of nav for visibility when signed in */}
          {(() => { try { const ProBadge = require('@/components/ProBadge').default; return <ProBadge />; } catch { return null; } })()}
          <Link href="/my-decks" className="text-sm hover:underline">
            My Decks
          </Link>
          <Link href="/collections" className="text-sm hover:underline">
            My Collections
          </Link>
          <Link href="/profile" className="text-sm hover:underline">
            Profile
          </Link>

          {sessionUser ? (
            <>
              <span className="flex items-center gap-2 text-xs opacity-90">
                {/* Pro badge */}
                {/** Lazy import would be overkill; include inline */}
              
                {avatar ? (<img src={avatar} alt="avatar" className="w-6 h-6 rounded-full object-cover" />) : null}
                <span>{displayName || sessionUser}</span>
                {/* Mount ProBadge next to name */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
              </span>
              <button
                onClick={signOut}
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
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
            <button
              type="button"
              onClick={() => setShowSignUp(true)}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5"
            >
              Create account
            </button>
            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5"
            >
              Forgot?
            </button>
            </>
          )}
        </nav>
      </div>

      {/* Sign up modal */}
      {showSignUp && (
        <div className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center">
          <div className="bg-neutral-900 text-white rounded-lg shadow-xl border border-neutral-700 w-full max-w-sm p-4">
            <div className="font-semibold mb-2">Create account</div>
            <form onSubmit={async (e) => { e.preventDefault(); try { const { error } = await supabase.auth.signUp({ email: signupEmail, password: signupPassword }); if (error) return alert(error.message); alert('Check your email to confirm.'); setShowSignUp(false); } catch (e:any) { alert(e?.message || 'Sign up failed'); } }}>
              <input value={signupEmail} onChange={(e)=>setSignupEmail(e.target.value)} type="email" placeholder="Email" className="w-full bg-neutral-950 text-white border border-neutral-700 rounded px-2 py-1 mb-2" required />
              <input value={signupPassword} onChange={(e)=>setSignupPassword(e.target.value)} type="password" placeholder="Password" className="w-full bg-neutral-950 text-white border border-neutral-700 rounded px-2 py-1 mb-3" required />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={()=>setShowSignUp(false)} className="px-3 py-1.5 rounded border border-neutral-700">Cancel</button>
                <button type="submit" className="px-3 py-1.5 rounded bg-white text-black">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Forgot modal */}
      {showForgot && (
        <div className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center">
          <div className="bg-neutral-900 text-white rounded-lg shadow-xl border border-neutral-700 w-full max-w-sm p-4">
            <div className="font-semibold mb-2">Reset password</div>
            <form onSubmit={async (e) => { e.preventDefault(); try { const redirectTo = `${window.location.origin}/api/auth/callback`; const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, { redirectTo }); if (error) return alert(error.message); alert('Password reset email sent.'); setShowForgot(false); } catch (e:any) { alert(e?.message || 'Reset failed'); } }}>
              <input value={forgotEmail} onChange={(e)=>setForgotEmail(e.target.value)} type="email" placeholder="Email" className="w-full bg-neutral-950 text-white border border-neutral-700 rounded px-2 py-1 mb-3" required />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={()=>setShowForgot(false)} className="px-3 py-1.5 rounded border border-neutral-700">Cancel</button>
                <button type="submit" className="px-3 py-1.5 rounded bg-white text-black">Send link</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
