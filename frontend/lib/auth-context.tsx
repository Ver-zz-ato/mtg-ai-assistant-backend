'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type AuthCtx = { user: User | null; session: Session | null; loading: boolean };
const AuthContext = createContext<AuthCtx>({ user: null, session: null, loading: true });

/**
 * AuthProvider: Push-based auth state management
 * 
 * PROBLEM SOLVED: Eliminates race conditions with getSession() hanging after window focus events.
 * Instead of calling getSession() on every navigation, we subscribe to onAuthStateChange once
 * and push updates to all consumers via React Context.
 * 
 * WHY THIS WORKS:
 * - Removes the call site that collides with Supabase's refresh mutex
 * - Treats getSession() as best-effort on mount (fails open if it hangs)
 * - Relies on onAuthStateChange (push) as the source of truth
 * - onAuthStateChange still fires on focus refresh but doesn't deadlock the UI
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(createBrowserSupabaseClient, []); // reuse singleton
  const [state, setState] = useState<AuthCtx>({ user: null, session: null, loading: true });

  useEffect(() => {
    let unsub = () => {};
    let mounted = true;

    console.log('🚀 [AuthProvider] Initializing auth state management');

    // 1) Initial read (don't block UI if it stalls)
    (async () => {
      try {
        console.log('🔐 [AuthProvider] Fetching initial session...');
        const { data } = await supabase.auth.getSession();
        if (!mounted) {
          console.log('⚠️ [AuthProvider] Component unmounted before session returned');
          return;
        }
        console.log('✅ [AuthProvider] Initial session fetched', {
          hasSession: !!data.session,
          userId: data.session?.user?.id?.slice(0, 8),
          email: data.session?.user?.email
        });
        setState({ user: data.session?.user ?? null, session: data.session ?? null, loading: false });
      } catch (err) {
        // In case getSession is locked on first mount, fail open and let the subscription correct it
        console.warn('⚠️ [AuthProvider] Initial getSession failed, relying on subscription', err);
        if (!mounted) return;
        setState((s) => ({ ...s, loading: false }));
      }
    })();

    // 2) Live updates (source of truth)
    console.log('📡 [AuthProvider] Subscribing to auth state changes');
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔔 [AuthProvider] Auth state changed:', event, {
        hasSession: !!session,
        userId: session?.user?.id?.slice(0, 8),
        email: session?.user?.email,
        timestamp: new Date().toISOString()
      });
      setState({ user: session?.user ?? null, session: session ?? null, loading: false });
    });
    unsub = () => {
      console.log('🧹 [AuthProvider] Unsubscribing from auth state changes');
      data.subscription.unsubscribe();
    };

    // 3) Be explicit about auto-refresh lifecycle (avoid double handlers)
    supabase.auth.startAutoRefresh();
    console.log('🔄 [AuthProvider] Auto-refresh started');

    return () => {
      console.log('🛑 [AuthProvider] Cleanup: stopping auto-refresh and unsubscribing');
      mounted = false;
      unsub();
      supabase.auth.stopAutoRefresh();
    };
  }, [supabase]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

/**
 * useAuth hook: Access current auth state
 * 
 * Returns:
 * - user: Current user object (null if not authenticated)
 * - session: Current session object (null if not authenticated)
 * - loading: True while initial auth check is in progress
 * 
 * Example:
 * ```tsx
 * const { user, loading } = useAuth();
 * if (loading) return <LoadingSkeleton />;
 * if (!user) return <GuestLandingPage />;
 * return <AuthenticatedContent userId={user.id} />;
 * ```
 */
export const useAuth = () => useContext(AuthContext);

