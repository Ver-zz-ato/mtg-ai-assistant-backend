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
    console.log('[AuthProvider] useEffect started');
    let unsub = () => {};
    let mounted = true;

    (async () => {
      console.log('[AuthProvider] Calling getSession...');
      let timedOut = false;
      
      try {
        // Add 3-second timeout to prevent hanging forever
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => {
          console.warn('[AuthProvider] getSession timeout after 3s, relying on onAuthStateChange');
          timedOut = true;
          if (mounted) {
            setState((s) => ({ ...s, loading: false }));
          }
          resolve(null);
        }, 3000));
        
        const sessionPromise = supabase.auth.getSession().then(result => result.data);
        const data = await Promise.race([sessionPromise, timeoutPromise]);
        
        // Only use getSession result if we didn't timeout
        if (data && !timedOut) {
          console.log('[AuthProvider] getSession returned in time:', { hasSession: !!data.session, userId: data.session?.user?.id });
          if (mounted) {
            setState({ user: data.session?.user ?? null, session: data.session ?? null, loading: false });
          }
        } else if (data && timedOut) {
          console.log('[AuthProvider] getSession returned but already timed out, ignoring (onAuthStateChange will handle it)');
        }
      } catch (err) {
        console.error('[AuthProvider] getSession error:', err);
        if (mounted && !timedOut) {
          setState((s) => ({ ...s, loading: false }));
        }
      }
    })();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthProvider] onAuthStateChange fired:', { event, hasSession: !!session, userId: session?.user?.id });
      setState({ user: session?.user ?? null, session: session ?? null, loading: false });
    });
    unsub = () => data.subscription.unsubscribe();

    supabase.auth.startAutoRefresh();

    return () => {
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

