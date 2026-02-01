'use client';

import Link from 'next/link';
import { useEffect, useState, useRef, useMemo } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useActiveUsers } from '@/lib/active-users-context';
import { capture, identify } from '@/lib/ph';
import { trackSignupStarted, trackSignupCompleted, trackFeatureDiscovered } from '@/lib/analytics-enhanced';
import Logo from './Logo';

export default function Header() {
  const [isHydrated, setIsHydrated] = useState(false);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []); // Use singleton
  const { user: authUser, loading: authLoading } = useAuth(); // NEW: Get auth state from context
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
  const [emailFormMode, setEmailFormMode] = useState<'signup' | 'login'>('signup');
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const [userStats, setUserStats] = useState<{ totalUsers: number; recentDecks: number } | null>(null);
  const { activeUsers } = useActiveUsers();

  useEffect(() => {
    setIsHydrated(true);
  }, []); // Run once on mount
  
  // Sync auth state from AuthProvider (single source of truth)
  useEffect(() => {
    if (authLoading) return;
    
    const u = authUser;
    setSessionUser(u?.email ?? null);
    
    if (u) {
      // Identify user in PostHog for filtering internal/test users
      const userEmail = u.email || '';
      const internalEmails = (process.env.NEXT_PUBLIC_INTERNAL_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      const isInternal = internalEmails.includes(userEmail.toLowerCase());
      
      identify(u.id, {
        email: userEmail,
        is_internal: isInternal,
        is_test_user: isInternal, // PostHog can filter on this property
      });
      
      const md: any = u.user_metadata || {};
      const name = (md.username || u.email || "").toString();
      const avatarUrl = (md.avatar || "").toString();
      
      setDisplayName(name);
      setAvatar(avatarUrl);
      
      // Fetch Pro status
      (async () => {
        try {
          // Check both database and metadata for consistency
          const { data: profile } = await supabase
            .from('profiles')
            .select('is_pro')
            .eq('id', u.id)
            .single();
          
          const isProFromProfile = profile?.is_pro === true;
          const isProFromMetadata = u.user_metadata?.is_pro === true || u.user_metadata?.pro === true;
          setIsPro(isProFromProfile || isProFromMetadata);
        } catch {
          // Fallback to metadata if database query fails
          const isProFromMetadata = u.user_metadata?.is_pro === true || u.user_metadata?.pro === true;
          setIsPro(isProFromMetadata);
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

  async function signInWithGoogle() {
    if (!supabase) return;
    try {
      trackSignupStarted('oauth', 'google');
      capture('auth_login_attempt', { method: 'oauth', provider: 'google' });
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        capture('auth_login_failed', { method: 'oauth', provider: 'google', error_type: 'other' });
        alert(error.message);
        return;
      }
    } catch (e: unknown) {
      capture('auth_login_failed', { method: 'oauth', provider: 'google', error_type: 'other' });
      alert(e instanceof Error ? e.message : 'Sign-in failed');
    }
  }

  async function signInWithOAuth(provider: 'google' | 'github' | 'discord') {
    if (provider === 'google') {
      signInWithGoogle();
      return;
    }
    if (!supabase) return;
    try {
      trackSignupStarted('oauth', provider);
      capture('auth_login_attempt', { method: 'oauth', provider });
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        capture('auth_login_failed', { method: 'oauth', provider, error_type: 'other' });
        alert(error.message);
        return;
      }
    } catch (e: unknown) {
      capture('auth_login_failed', { method: 'oauth', provider, error_type: 'other' });
      alert(e instanceof Error ? e.message : 'Sign-in failed');
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
        // Silently fail
      }
      
      window.location.reload();
    } catch (error: any) {
      
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
      if (mode === 'signup' || mode === 'signin') {
        setShowSignUp(true);
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
            className="text-sm hover:underline text-green-500 font-medium flex items-center gap-1 px-2 py-1 rounded transition-all hover:bg-green-500/10 hover:shadow-sm"
            onClick={() => capture('nav_link_clicked', { destination: '/changelog', source: 'header' })}
          >
            <span className="text-xs">✨</span>
            What's New
          </Link>
          <Link 
            href="/decks/browse" 
            className="text-sm hover:underline text-purple-400 font-medium px-2 py-1 rounded transition-all hover:bg-purple-400/10 hover:shadow-sm"
            onClick={() => capture('nav_link_clicked', { destination: '/decks/browse', source: 'header' })}
          >
            Browse Decks
          </Link>
          <Link 
            href="/mtg-commander-ai-deck-builder" 
            className="text-sm hover:underline text-blue-400 font-medium px-2 py-1 rounded transition-all hover:bg-blue-400/10 hover:shadow-sm"
            onClick={() => capture('nav_link_clicked', { destination: '/mtg-commander-ai-deck-builder', source: 'header' })}
          >
            Deck Builder
          </Link>
          <Link 
            href="/blog" 
            className="text-sm hover:underline text-red-400 font-medium px-2 py-1 rounded transition-all hover:bg-red-400/10 hover:shadow-sm"
            onClick={() => capture('nav_link_clicked', { destination: '/blog', source: 'header' })}
          >
            Blog
          </Link>
          <Link 
            href="/pricing" 
            className="text-sm hover:underline text-yellow-400 font-medium px-2 py-1 rounded transition-all hover:bg-yellow-400/10 hover:shadow-sm"
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
              </div>
            )}
          </div>

          <Link 
            href="/my-decks" 
            className="text-sm hover:underline text-pink-400 font-medium px-2 py-1 rounded transition-all hover:bg-pink-400/10 hover:shadow-sm"
            onClick={() => {
              capture('nav_link_clicked', { destination: '/my-decks', source: 'header' });
              trackFeatureDiscovered('deck_management', 'navigation');
            }}
          >
            My Decks
          </Link>
          <Link 
            href="/collections" 
            className="text-sm hover:underline text-cyan-400 font-medium px-2 py-1 rounded transition-all hover:bg-cyan-400/10 hover:shadow-sm"
            onClick={() => {
              capture('nav_link_clicked', { destination: '/collections', source: 'header' });
              trackFeatureDiscovered('collection_management', 'navigation');
            }}
          >
            My Collections
          </Link>
          <Link 
            href="/wishlist" 
            className="text-sm hover:underline text-rose-400 font-medium px-2 py-1 rounded transition-all hover:bg-rose-400/10 hover:shadow-sm"
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
            <span className="flex items-center gap-2 text-xs opacity-90 max-w-[120px] truncate">
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
            // Guest mode - no profile button shown
            // Single entry point opens modal (handles both sign in and sign up)
            <button
              type="button"
              onClick={() => {
                trackSignupStarted('email', 'header_button');
                setShowSignUp(true);
              }}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-black/5 whitespace-nowrap flex-shrink-0"
            >
              Sign in / Sign up
            </button>
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
              href="/mtg-commander-ai-deck-builder" 
              className="block py-2 text-sm text-blue-400 font-medium"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/mtg-commander-ai-deck-builder', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              Deck Builder
            </Link>
            <Link
              href="/blog"
              className="block py-2 text-sm text-red-400 font-medium"
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
              className="block py-2 px-2 text-sm text-pink-400 font-medium rounded transition-all hover:bg-pink-400/10"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/my-decks', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              My Decks
            </Link>
            <Link 
              href="/collections" 
              className="block py-2 px-2 text-sm text-cyan-400 font-medium rounded transition-all hover:bg-cyan-400/10"
              onClick={() => {
                capture('nav_link_clicked', { destination: '/collections', source: 'mobile_menu' });
                setMobileMenuOpen(false);
              }}
            >
              My Collections
            </Link>
            <Link 
              href="/wishlist" 
              className="block py-2 px-2 text-sm text-rose-400 font-medium rounded transition-all hover:bg-rose-400/10"
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
                <button
                  onClick={() => { setShowSignUp(true); setMobileMenuOpen(false); }}
                  className="w-full rounded-lg bg-blue-600 text-white px-3 py-2 text-sm hover:bg-blue-700 whitespace-nowrap"
                >
                  Sign in / Sign up
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
                    setEmailFormMode('signup');
                  }}
                  className="absolute top-4 right-4 text-neutral-400 hover:text-white text-2xl leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
                <div className="text-2xl font-bold mb-3 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Sign in or Create account
                </div>
                <div className="text-sm text-neutral-300 mb-2">
                  Save decks, track collections, and explore <span className="text-yellow-400 font-semibold">Pro features</span> ✨
                </div>
                <div className="flex items-center gap-2 mb-4 text-xs text-neutral-400">
                  <span className="flex items-center gap-1">
                    <span className="text-emerald-400">✓</span> Free forever
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <span className="text-emerald-400">✓</span> No credit card required
                  </span>
                </div>
                
                {/* Live Presence Banner - Enhanced */}
                <div className="mb-5 p-4 bg-gradient-to-r from-emerald-600/20 to-green-600/20 border border-emerald-500/40 rounded-lg shadow-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-500/50"></div>
                    <span className="text-emerald-300 font-bold text-base">
                      {activeUsers
                        ? `${activeUsers} Players brewing right now`
                        : '🟢 Join the community brewing decks'}
                    </span>
                  </div>
                  
                  {/* Activity Ticker - Enhanced */}
                  <div className="text-sm text-emerald-200/90 space-y-1.5 border-t border-emerald-500/30 pt-3">
                    {userStats && userStats.totalUsers > 0 ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 text-base">⚡</span>
                          <span className="truncate font-medium">
                            New deck uploaded: <span className="italic text-emerald-300">Atraxa Reanimator</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-green-400 text-base">💰</span>
                          <span className="font-medium">
                            {userStats.totalUsers.toLocaleString()}+ builders • Price trends down 4.2% this week
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Join our growing community of deck builders and strategists</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* OAuth providers */}
                <div className="mb-4 space-y-2">
                  <button
                    type="button"
                    onClick={() => signInWithGoogle()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-neutral-600 bg-neutral-800/80 hover:bg-neutral-700 text-white font-medium transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Sign in with Google
                  </button>
                  <button
                    type="button"
                    onClick={() => signInWithOAuth('github')}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-neutral-600 bg-neutral-800/80 hover:bg-neutral-700 text-white font-medium transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                    Sign in with GitHub
                  </button>
                  <button
                    type="button"
                    onClick={() => signInWithOAuth('discord')}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-neutral-600 bg-neutral-800/80 hover:bg-neutral-700 text-white font-medium transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                    </svg>
                    Sign in with Discord
                  </button>
                </div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex-1 h-px bg-neutral-700" />
                  <span className="text-xs text-neutral-500">or continue with email</span>
                  <div className="flex-1 h-px bg-neutral-700" />
                </div>

                <form onSubmit={async (e) => { 
                  e.preventDefault(); 
                  
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!emailRegex.test(signupEmail)) {
                    setSignupEmailError('Please enter a valid email address');
                    return;
                  }
                  setSignupEmailError('');
                  setSignupPasswordError('');
                  
                  if (emailFormMode === 'login') {
                    if (!signupPassword.length) {
                      setSignupPasswordError('Enter your password');
                      return;
                    }
                    try {
                      const { data, error } = await supabase.auth.signInWithPassword({ email: signupEmail, password: signupPassword });
                      if (error) {
                        setSignupPasswordError(error.message);
                        return;
                      }
                      capture('auth_login_success', { method: 'email_password' });
                      if (data?.user) identify(data.user.id, { email: data.user.email ?? undefined });
                      setShowSignUp(false);
                      setSignupEmail('');
                      setSignupPassword('');
                      setEmailFormMode('signup');
                      window.location.reload();
                    } catch (err: any) {
                      setSignupPasswordError(err?.message || 'Sign in failed');
                    }
                    return;
                  }
                  
                  if (signupPassword.length < 8) {
                    setSignupPasswordError('Password must be at least 8 characters');
                    return;
                  }
                  
                  try { 
                    trackSignupStarted('email');
                    const { data, error } = await supabase.auth.signUp({ email: signupEmail, password: signupPassword }); 
                    if (error) {
                      const msg = error.message || '';
                      const alreadyRegistered = /already registered|already been registered|user already exists/i.test(msg);
                      if (alreadyRegistered) {
                        setEmailFormMode('login');
                        setSignupPasswordError('This email is already registered. Sign in with your password above.');
                      } else {
                        setSignupPasswordError(msg);
                      }
                      return;
                    }
                    // Supabase often returns success (no error) when email already exists (e.g. from OAuth);
                    // it does not create a new identity, so identities is empty — treat as "already in use".
                    const identities = (data?.user as { identities?: unknown[] } | undefined)?.identities;
                    if (!identities || identities.length === 0) {
                      setEmailFormMode('login');
                      setSignupEmailError('This email is already in use. Sign in with your password or use Google, GitHub, or Discord above.');
                      return;
                    }
                    
                    trackSignupCompleted('email', data?.user?.id);
                    try {
                      await fetch('/api/analytics/track-signup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ method: 'email', userId: data?.user?.id, userEmail: signupEmail })
                      });
                    } catch {}
                    try {
                      const signupMessages = ['New player joined!', 'Someone just signed up!', 'New member joined the community', 'Welcome, new brewer!', 'Another player arrived!'];
                      await fetch('/api/stats/activity/log', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ type: 'user_joined', message: signupMessages[Math.floor(Math.random() * signupMessages.length)] }),
                      });
                    } catch {}
                    setSignupSuccess(true);
                  } catch (e: any) { 
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
                        placeholder={emailFormMode === 'login' ? 'Your password' : 'Min 8 characters'} 
                        className={`w-full bg-neutral-950 text-white border rounded px-3 py-2 ${signupPasswordError ? 'border-red-500' : 'border-neutral-700'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        autoComplete={emailFormMode === 'login' ? 'current-password' : 'new-password'}
                        minLength={emailFormMode === 'signup' ? 8 : undefined}
                        required 
                      />
                      {signupPasswordError && (
                        <div className="text-xs text-red-400 mt-1">{signupPasswordError}</div>
                      )}
                      
                      {/* Password Requirements Checklist - only for signup */}
                      {emailFormMode === 'signup' && signupPassword.length > 0 && (
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
                          <div className={`text-xs flex items-center gap-1.5 ${/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(signupPassword) ? 'text-emerald-400' : 'text-neutral-500'}`}>
                            <span>{/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(signupPassword) ? '✓' : '○'}</span>
                            <span>One special character (recommended)</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-center gap-3 mt-6">
                    <div className="flex justify-center gap-2 w-full">
                      <button 
                        type="button" 
                        onClick={()=>{
                          setShowSignUp(false);
                          setSignupEmail('');
                          setSignupPassword('');
                          setSignupEmailError('');
                          setSignupPasswordError('');
                          setSignupSuccess(false);
                          setEmailFormMode('signup');
                        }} 
                        className="px-4 py-2 rounded border border-neutral-700 hover:bg-neutral-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        className="px-6 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold transition-all shadow-lg hover:shadow-xl"
                      >
                        {emailFormMode === 'login' ? 'Sign in' : 'Create account'}
                      </button>
                    </div>
                    <div className="flex items-center justify-center gap-4 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setEmailFormMode(m => m === 'signup' ? 'login' : 'signup');
                          setSignupEmailError('');
                          setSignupPasswordError('');
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300 underline"
                      >
                        {emailFormMode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
                      </button>
                      {emailFormMode === 'login' && (
                        <button
                          type="button"
                          onClick={() => { setShowSignUp(false); setShowForgot(true); setForgotEmail(signupEmail); }}
                          className="text-xs text-neutral-400 hover:text-neutral-300 underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Privacy & Terms */}
                  <div className="mt-4 pt-4 border-t border-neutral-700 text-center text-xs text-neutral-400">
                    By signing in or creating an account, you agree to our{' '}
                    <a 
                      href="/terms" 
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                    >
                      Terms of Service
                    </a>
                    {' '}and{' '}
                    <a 
                      href="/privacy" 
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                    >
                      Privacy Policy
                    </a>
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
