'use client';

import Link from 'next/link';
import { useEffect, useState, useRef, useMemo } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context'; // NEW: Use push-based auth
import { capture } from '@/lib/ph';
import { trackSignupStarted, trackSignupCompleted, trackFeatureDiscovered } from '@/lib/analytics-enhanced';
import Logo from './Logo';

export default function Header() {
  const [isHydrated, setIsHydrated] = useState(false);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []); // Use singleton
  const { user: authUser, loading: authLoading } = useAuth(); // NEW: Get auth state from context
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [avatar, setAvatar] = useState<string>("");
  const [isPro, setIsPro] = useState<boolean>(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupEmailError, setSignupEmailError] = useState("");
  const [signupPasswordError, setSignupPasswordError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const [userStats, setUserStats] = useState<{ totalUsers: number; recentDecks: number } | null>(null);

  useEffect(() => {
    setIsHydrated(true);
  }, []); // Run once on mount
  
  // Sync auth state from AuthProvider (single source of truth)
  useEffect(() => {
    if (authLoading) return;
    
    const u = authUser;
    setSessionUser(u?.email ?? null);
    
    if (u) {
      const md: any = u.user_metadata || {};
      const name = (md.username || u.email || "").toString();
      const avatarUrl = (md.avatar || "").toString();
      
      setDisplayName(name);
      setAvatar(avatarUrl);
      
      // Fetch Pro status
      (async () => {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('is_pro')
            .eq('id', u.id)
            .single();
          
          setIsPro(profile?.is_pro || false);
        } catch {
          setIsPro(false);
        }
      })();
    } else {
      setDisplayName('');
      setAvatar('');
      setIsPro(false);
    }
  }, [authUser, authLoading, supabase]);

  // Close help menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (helpMenuRef.current && !helpMenuRef.current.contains(event.target as Node)) {
        setShowHelpMenu(false);
      }
    };
    
    if (showHelpMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showHelpMenu]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    capture('auth_login_attempt', { method: 'email_password' });
    
    if (!supabase) {
      alert('Authentication not ready. Please refresh the page.');
      return;
    }
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
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
      
      // Check if email is verified
      const user = data?.user;
      if (user && !user.email_confirmed_at) {
        // Email not verified - show resend option
        const resend = confirm(
          `⚠️ Email Not Verified\n\n` +
          `Your email (${user.email}) hasn't been verified yet.\n\n` +
          `Would you like us to resend the verification email?`
        );
        
        if (resend) {
          try {
            await supabase.auth.resend({
              type: 'signup',
              email: user.email!,
            });
            alert('✅ Verification email sent! Please check your inbox and spam folder.');
            capture('email_verification_resent_on_login', { email: user.email });
          } catch (resendErr: any) {
            alert(`❌ Failed to resend: ${resendErr.message}`);
          }
        }
      }
      
      window.location.reload();
    } catch (err) {
      console.error('[Header] Sign in exception:', err);
      alert('Login failed. Please try again.');
    }
  }

  async function signOut() {
    capture('auth_logout_attempt');
    
    if (!supabase) {
      return;
    }
    
    try {
      // Add timeout to prevent hanging
      const signOutPromise = supabase.auth.signOut();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Sign out timeout')), 3000);
      });
      
      await Promise.race([signOutPromise, timeoutPromise]);
      
      capture('auth_logout_success');
      
      // Clear localStorage manually as fallback
      try {
        const keys = Object.keys(localStorage);
        const authKeys = keys.filter(k => k.includes('auth-token') || k.includes('supabase'));
        authKeys.forEach(k => localStorage.removeItem(k));
      } catch (e) {
        console.error('[Header] Failed to clear localStorage:', e);
      }
      
      window.location.reload();
    } catch (error: any) {
      console.error('[Header] signOut() failed:', error);
      
      // Even if signOut fails, try to clear localStorage and reload
      if (error.message === 'Sign out timeout') {
        try {
          const keys = Object.keys(localStorage);
          const authKeys = keys.filter(k => k.includes('auth-token') || k.includes('supabase'));
          authKeys.forEach(k => localStorage.removeItem(k));
          capture('auth_logout_timeout_fallback');
          window.location.reload();
          return;
        } catch {}
      }
      
      capture('auth_logout_failed', { error: error?.message });
      alert('Failed to sign out: ' + error.message);
    }
  }

  // Fetch user stats when signup modal opens
  useEffect(() => {
    if (showSignUp && !userStats) {
      fetch('/api/stats/users')
        .then(r => r.json())
        .then(data => {
          if (data.ok) {
            setUserStats({ totalUsers: data.totalUsers, recentDecks: data.recentDecks });
          }
        })
        .catch(() => {});
    }
  }, [showSignUp, userStats]);

  // Listen for auth modal open events from guest components
  useEffect(() => {
    const handleOpenAuth = (e: any) => {
      const mode = e.detail?.mode;
      if (mode === 'signup') {
        setShowSignUp(true);
      } else if (mode === 'signin') {
        // Could add sign in modal here if needed
      }
    };

    window.addEventListener('open-auth-modal', handleOpenAuth);
    return () => window.removeEventListener('open-auth-modal', handleOpenAuth);
  }, []);

  return (
    <header className="w-full border-b">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="font-semibold flex items-center gap-2 flex-shrink-0">
          <Logo size={63} />
          <span className="hidden sm:block text-3xl font-bold whitespace-nowrap">ManaTap AI</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-3 flex-shrink-0">
          <Link 
            href="/changelog" 
            className="text-sm hover:underline text-green-500 font-medium flex items-center gap-1"
            onClick={() => capture('nav_link_clicked', { destination: '/changelog', source: 'header' })}
          >
            <span className="text-xs">✨</span>
            What's New
          </Link>
          <Link 
            href="/decks/browse" 
            className="text-sm hover:underline text-purple-400 font-medium"
            onClick={() => capture('nav_link_clicked', { destination: '/decks/browse', source: 'header' })}
          >
            Browse Decks
          </Link>
          <Link 
            href="/blog" 
            className="text-sm hover:underline text-blue-400 font-medium"
            onClick={() => capture('nav_link_clicked', { destination: '/blog', source: 'header' })}
          >
            Blog
          </Link>
          <Link 
            href="/pricing" 
            className="text-sm hover:underline text-yellow-400 font-medium"
            onClick={() => capture('nav_link_clicked', { destination: '/pricing', source: 'header' })}
          >
            Pricing
          </Link>
          
          {/* Help Menu */}
          <div className="relative" ref={helpMenuRef}>
            <button
              onClick={() => setShowHelpMenu(!showHelpMenu)}
              className="text-sm hover:underline text-orange-400 font-medium flex items-center gap-1"
            >
              Help
              <span className="text-xs">▾</span>
            </button>
            
            {showHelpMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50">
                <Link
                  href="/support"
                  className="block px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => {
                    setShowHelpMenu(false);
                    capture('help_menu_clicked', { link: 'get_help' });
                  }}
                >
                  <div className="font-medium">📧 Get Help</div>
                  <div className="text-xs opacity-70">Contact support</div>
                </Link>
                <Link
                  href="/terms"
                  className="block px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => {
                    setShowHelpMenu(false);
                    capture('help_menu_clicked', { link: 'terms' });
                  }}
                >
                  <div className="font-medium">Terms & Privacy</div>
                  <div className="text-xs opacity-70">Legal & disclaimers</div>
                </Link>
                <hr className="my-2 border-gray-200 dark:border-gray-700" />
                <Link
                  href="/pricing"
                  className="block px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => {
                    setShowHelpMenu(false);
                    capture('help_menu_clicked', { link: 'pricing' });
                  }}
                >
                  <div className="font-medium">Pricing</div>
                  <div className="text-xs opacity-70">Free & Pro features</div>
                </Link>
              </div>
            )}
          </div>

          <Link 
            href="/my-decks" 
            className="text-sm hover:underline text-pink-400 font-medium"
            onClick={() => {
              capture('nav_link_clicked', { destination: '/my-decks', source: 'header' });
              trackFeatureDiscovered('deck_management', 'navigation');
            }}
          >
            My Decks
          </Link>
          <Link 
            href="/collections" 
            className="text-sm hover:underline text-cyan-400 font-medium"
            onClick={() => {
              capture('nav_link_clicked', { destination: '/collections', source: 'header' });
              trackFeatureDiscovered('collection_management', 'navigation');
            }}
          >
            My Collections
          </Link>
          <Link 
            href="/wishlist" 
            className="text-sm hover:underline text-rose-400 font-medium"
            onClick={() => capture('nav_link_clicked', { destination: '/wishlist', source: 'header' })}
          >
            My Wishlist
          </Link>
        </nav>

        {/* Right side: Auth */}
        <div className="flex items-center gap-3" suppressHydrationWarning>
          {!isHydrated ? (
            <div className="h-[38px]" /> 
          ) : sessionUser ? (
            <div className="flex items-center gap-2 ml-3">
              <Link
                href="/profile"
                prefetch={false}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profile
              </Link>
              <span className="flex items-center gap-2 text-xs opacity-90 max-w-[120px] truncate" data-tour="profile-user">
                {avatar ? (<img src={avatar} alt="avatar" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />) : null}
                <span className="hidden md:block truncate">{displayName || sessionUser}</span>
              </span>
              <button
                onClick={signOut}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 transition-colors whitespace-nowrap flex-shrink-0"
              >
                Sign out
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={signIn} className="flex items-center gap-2">
                <input
                  type="email"
                  placeholder="email"
                  className="rounded-lg border px-2 py-1 text-sm w-24"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <input
                  type="password"
                  placeholder="password"
                  className="rounded-lg border px-2 py-1 text-sm w-24"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
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
        </div>

        {/* Mobile Navigation */}
        <div className="lg:hidden flex items-center gap-2" suppressHydrationWarning>
          {isHydrated && sessionUser && avatar && (
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
              href="/changelog" 
              className="block py-2 text-sm text-green-500 font-medium flex items-center gap-1"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/changelog', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              <span className="text-xs">✨</span>
              What's New
            </Link>
            <Link 
              href="/decks/browse" 
              className="block py-2 text-sm text-purple-400 font-medium"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/decks/browse', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              Browse Decks
            </Link>
            <Link 
              href="/blog" 
              className="block py-2 text-sm text-blue-400 font-medium"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/blog', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              Blog
            </Link>
            <Link 
              href="/pricing" 
              className="block py-2 text-sm text-yellow-400 font-medium"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/pricing', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              Pricing
            </Link>
            <div className="block py-2 text-sm text-orange-400 font-medium">Help</div>
            <Link 
              href="/my-decks" 
              className="block py-2 text-sm text-pink-400 font-medium"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/my-decks', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              My Decks
            </Link>
            <Link 
              href="/collections" 
              className="block py-2 text-sm text-cyan-400 font-medium"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/collections', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              My Collections
            </Link>
            <Link 
              href="/wishlist" 
              className="block py-2 text-sm text-rose-400 font-medium"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/wishlist', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              My Wishlist
            </Link>

            {!isHydrated ? (
              <div className="h-[100px]" />
            ) : sessionUser ? (
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
                    autoComplete="email"
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
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
          <div className="bg-neutral-900 text-white rounded-lg shadow-xl border border-neutral-700 w-full max-w-md p-6 relative">
            {!signupSuccess ? (
              <>
                <button
                  onClick={() => {
                    setShowSignUp(false);
                    setSignupEmail('');
                    setSignupPassword('');
                    setSignupEmailError('');
                    setSignupPasswordError('');
                    setSignupSuccess(false);
                  }}
                  className="absolute top-4 right-4 text-neutral-400 hover:text-white text-2xl leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
                <div className="text-xl font-semibold mb-2">Create account</div>
                <div className="text-sm text-neutral-400 mb-2">
                  Save decks, like builds, and unlock Pro features.
                </div>
                
                {/* Social proof */}
                {userStats && (
                  <div className="mb-4 p-3 bg-emerald-600/10 border border-emerald-600/30 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-emerald-400 font-semibold">
                          Join {userStats.totalUsers.toLocaleString()}+ deck builders
                        </span>
                      </div>
                    </div>
                    {userStats.recentDecks > 0 && (
                      <div className="text-xs text-emerald-300/70 mt-1">
                        {userStats.recentDecks} deck{userStats.recentDecks !== 1 ? 's' : ''} built in the last hour
                      </div>
                    )}
                  </div>
                )}
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
                        autoComplete="email"
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
                        autoComplete="new-password"
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
                <div className="text-sm text-neutral-400 mb-4">
                  Check your email to confirm your account and start building amazing decks.
                </div>
                
                {/* Verification email info */}
                <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-4 mb-6 text-left">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">✉️</div>
                    <div className="flex-1 text-sm">
                      <div className="font-semibold text-amber-400 mb-1">Verification Email Sent</div>
                      <div className="text-neutral-300">
                        We sent a verification email to <span className="font-mono text-amber-200">{signupEmail}</span>
                      </div>
                      <div className="text-neutral-400 text-xs mt-2">
                        Don't see it? Check your spam folder or click below to resend.
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await supabase.auth.resend({
                              type: 'signup',
                              email: signupEmail,
                            });
                            alert('✅ Verification email resent! Check your inbox.');
                            capture('email_verification_resent_on_signup', { email: signupEmail });
                          } catch (err: any) {
                            alert(`❌ Failed to resend: ${err.message}`);
                          }
                        }}
                        className="mt-3 text-xs text-amber-300 hover:text-amber-200 underline"
                      >
                        Resend verification email
                      </button>
                    </div>
                  </div>
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
              <input value={forgotEmail} onChange={(e)=>setForgotEmail(e.target.value)} type="email" placeholder="Email" className="w-full bg-neutral-950 text-white border border-neutral-700 rounded px-2 py-1 mb-3" autoComplete="email" required />
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
