'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { capture } from '@/lib/ph';
import { trackSignupStarted, trackSignupCompleted, trackFeatureDiscovered } from '@/lib/analytics-enhanced';
import Logo from './Logo';

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
  const [signupEmailError, setSignupEmailError] = useState("");
  const [signupPasswordError, setSignupPasswordError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    capture('auth_login_attempt', { method: 'email_password' });
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const errorType = error.message.toLowerCase().includes('invalid') ? 'invalid_credentials' : 
                       error.message.toLowerCase().includes('network') ? 'network' : 'other';
      capture('auth_login_failed', { method: 'email_password', error_type: errorType });
      alert(error.message);
      return;
    }
    
    capture('auth_login_success', { method: 'email_password' });
    trackSignupCompleted('email'); // This could be login or signup completion
    
    // Store signup time for tenure tracking
    try {
      if (!localStorage.getItem('user_signup_time')) {
        localStorage.setItem('user_signup_time', Date.now().toString());
      }
    } catch {}
    
    window.location.reload();
  }

  async function signOut() {
    capture('auth_logout_attempt');
    try {
      await supabase.auth.signOut();
      capture('auth_logout_success');
      window.location.reload();
    } catch (error: any) {
      capture('auth_logout_failed', { error: error?.message });
      throw error;
    }
  }

  return (
    <header className="w-full border-b">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-semibold flex items-center gap-2">
          <Logo size={42} />
          <span className="hidden sm:block text-3xl font-bold">ManaTap AI</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-3">
          <Link 
            href="/my-decks" 
            className="text-sm hover:underline"
            onClick={() => {
              capture('nav_link_clicked', { destination: '/my-decks', source: 'header' });
              trackFeatureDiscovered('deck_management', 'navigation');
            }}
          >
            My Decks
          </Link>
          <Link 
            href="/collections" 
            className="text-sm hover:underline"
            onClick={() => {
              capture('nav_link_clicked', { destination: '/collections', source: 'header' });
              trackFeatureDiscovered('collection_management', 'navigation');
            }}
          >
            My Collections
          </Link>
          <Link 
            href="/wishlist" 
            className="text-sm hover:underline"
            onClick={() => capture('nav_link_clicked', { destination: '/wishlist', source: 'header' })}
          >
            My Wishlist
          </Link>
          <Link 
            href="/pricing" 
            className="text-sm hover:underline text-blue-600 font-medium"
            onClick={() => capture('nav_link_clicked', { destination: '/pricing', source: 'header' })}
          >
            Pricing
          </Link>
          <Link 
            href="/profile" 
            className="text-sm hover:underline"
            onClick={() => capture('nav_link_clicked', { destination: '/profile', source: 'header' })}
          >
            Profile
          </Link>
          <Link 
            href="/changelog" 
            className="text-sm hover:underline text-green-600 font-medium flex items-center gap-1"
            onClick={() => capture('nav_link_clicked', { destination: '/changelog', source: 'header' })}
          >
            <span className="text-xs">✨</span>
            What's New
          </Link>

          {sessionUser ? (
            <>
              <span className="flex items-center gap-2 text-xs opacity-90">
                {avatar ? (<img src={avatar} alt="avatar" className="w-6 h-6 rounded-full object-cover" />) : null}
                <span className="hidden md:block">{displayName || sessionUser}</span>
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
                  className="rounded-lg border px-2 py-1 text-sm w-24"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder="password"
                  className="rounded-lg border px-2 py-1 text-sm w-24"
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
                onClick={() => {
                  trackSignupStarted('email', 'header_button');
                  setShowSignUp(true);
                }}
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5"
              >
                Sign up
              </button>
            </>
          )}
        </nav>

        {/* Mobile Navigation */}
        <div className="lg:hidden flex items-center gap-2">
          {sessionUser && avatar && (
            <img src={avatar} alt="avatar" className="w-6 h-6 rounded-full object-cover" />
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t bg-white dark:bg-gray-900">
          <div className="px-4 py-3 space-y-3">
            {(() => { try { const ProBadge = require('@/components/ProBadge').default; return <ProBadge showUpgradeTooltip={true} />; } catch { return null; } })()}
            
            <Link 
              href="/my-decks" 
              className="block py-2 text-sm hover:text-blue-600"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/my-decks', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              My Decks
            </Link>
            <Link 
              href="/collections" 
              className="block py-2 text-sm hover:text-blue-600"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/collections', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              My Collections
            </Link>
            <Link 
              href="/wishlist" 
              className="block py-2 text-sm hover:text-blue-600"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/wishlist', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              My Wishlist
            </Link>
            <Link 
              href="/pricing" 
              className="block py-2 text-sm hover:text-blue-600 text-blue-600 font-medium"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/pricing', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              💎 Pricing
            </Link>
            <Link 
              href="/profile" 
              className="block py-2 text-sm hover:text-blue-600"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/profile', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              Profile
            </Link>

            {sessionUser ? (
              <>
                <div className="py-2 text-xs text-gray-600 border-t">
                  {displayName || sessionUser}
                </div>
                <button
                  onClick={() => { signOut(); setMobileMenuOpen(false); }}
                  className="w-full text-left py-2 text-sm text-red-600 hover:text-red-800"
                >
                  Sign out
                </button>
              </>
            ) : (
              <div className="border-t pt-3 space-y-2">
                <form onSubmit={(e) => { signIn(e); setMobileMenuOpen(false); }} className="space-y-2">
                  <input
                    type="email"
                    placeholder="Email"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-blue-600 text-white px-3 py-2 text-sm hover:bg-blue-700"
                  >
                    Sign in
                  </button>
                </form>
                <button
                  onClick={() => { setShowSignUp(true); setMobileMenuOpen(false); }}
                  className="w-full rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Create account
                </button>
                <button
                  onClick={() => { setShowForgot(true); setMobileMenuOpen(false); }}
                  className="w-full rounded-lg border px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Forgot password?
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sign up modal */}
      {showSignUp && (
        <div className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-neutral-900 text-white rounded-lg shadow-xl border border-neutral-700 w-full max-w-md p-6">
            {!signupSuccess ? (
              <>
                <div className="text-xl font-semibold mb-2">Create account</div>
                <div className="text-sm text-neutral-400 mb-4">
                  Save decks, like builds, and unlock Pro features.
                </div>
                <form onSubmit={async (e) => { 
                  e.preventDefault(); 
                  
                  // Validate email
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!emailRegex.test(signupEmail)) {
                    setSignupEmailError('Please enter a valid email address');
                    return;
                  }
                  setSignupEmailError('');
                  
                  // Validate password
                  if (signupPassword.length < 8) {
                    setSignupPasswordError('Password must be at least 8 characters');
                    return;
                  }
                  setSignupPasswordError('');
                  
                  try { 
                    trackSignupStarted('email');
                    const { error } = await supabase.auth.signUp({ email: signupEmail, password: signupPassword }); 
                    if (error) {
                      setSignupPasswordError(error.message);
                      return;
                    }
                    
                    trackSignupCompleted('email');
                    setSignupSuccess(true);
                  } catch (e:any) { 
                    setSignupPasswordError(e?.message || 'Sign up failed');
                  } 
                }}>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Email</label>
                      <input 
                        value={signupEmail} 
                        onChange={(e)=>{
                          setSignupEmail(e.target.value);
                          setSignupEmailError('');
                        }} 
                        type="email" 
                        placeholder="your@email.com" 
                        className={`w-full bg-neutral-950 text-white border rounded px-3 py-2 ${signupEmailError ? 'border-red-500' : 'border-neutral-700'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        required 
                      />
                      {signupEmailError && (
                        <div className="text-xs text-red-400 mt-1">{signupEmailError}</div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Password</label>
                      <input 
                        value={signupPassword} 
                        onChange={(e)=>{
                          setSignupPassword(e.target.value);
                          setSignupPasswordError('');
                        }} 
                        type="password" 
                        placeholder="Min 8 characters" 
                        className={`w-full bg-neutral-950 text-white border rounded px-3 py-2 ${signupPasswordError ? 'border-red-500' : 'border-neutral-700'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        minLength={8}
                        required 
                      />
                      {signupPasswordError && (
                        <div className="text-xs text-red-400 mt-1">{signupPasswordError}</div>
                      )}
                      
                      {/* Password Requirements Checklist */}
                      {signupPassword.length > 0 && (
                        <div className="mt-2 space-y-1">
                          <div className="text-xs font-medium text-neutral-400 mb-1">Password requirements:</div>
                          <div className={`text-xs flex items-center gap-1.5 ${signupPassword.length >= 8 ? 'text-emerald-400' : 'text-neutral-500'}`}>
                            <span>{signupPassword.length >= 8 ? '✓' : '○'}</span>
                            <span>At least 8 characters</span>
                          </div>
                          <div className={`text-xs flex items-center gap-1.5 ${/[A-Z]/.test(signupPassword) ? 'text-emerald-400' : 'text-neutral-500'}`}>
                            <span>{/[A-Z]/.test(signupPassword) ? '✓' : '○'}</span>
                            <span>One uppercase letter (recommended)</span>
                          </div>
                          <div className={`text-xs flex items-center gap-1.5 ${/[0-9]/.test(signupPassword) ? 'text-emerald-400' : 'text-neutral-500'}`}>
                            <span>{/[0-9]/.test(signupPassword) ? '✓' : '○'}</span>
                            <span>One number (recommended)</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-2 mt-6">
                    <button 
                      type="button" 
                      onClick={()=>{
                        setShowSignUp(false);
                        setSignupEmail('');
                        setSignupPassword('');
                        setSignupEmailError('');
                        setSignupPasswordError('');
                        setSignupSuccess(false);
                      }} 
                      className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-800"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-4 py-2 rounded bg-white text-black hover:bg-gray-200 font-medium"
                    >
                      Create Account
                    </button>
                  </div>
                </form>
              </>
            ) : (
              // Success State
              <div className="text-center py-8">
                <div className="text-6xl mb-4">🎉</div>
                <div className="text-2xl font-bold mb-3 bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                  Account Created!
                </div>
                <div className="text-lg mb-2">Welcome to ManaTap AI!</div>
                <div className="text-sm text-neutral-400 mb-6">
                  Check your email to confirm your account and start building amazing decks.
                </div>
                <button 
                  onClick={()=>{
                    setShowSignUp(false);
                    setSignupEmail('');
                    setSignupPassword('');
                    setSignupEmailError('');
                    setSignupPasswordError('');
                    setSignupSuccess(false);
                  }} 
                  className="px-6 py-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                >
                  Get Started
                </button>
              </div>
            )}
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
