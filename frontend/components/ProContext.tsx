'use client';
import React from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context'; // NEW: Use push-based auth

export type ProContextValue = { isPro: boolean };
const ProContext = React.createContext<ProContextValue>({ isPro: false });

export function usePro(): ProContextValue {
  return React.useContext(ProContext);
}

export default function ProProvider({ children }: { children: React.ReactNode }) {
  const [isPro, setIsPro] = React.useState(false);
  const { user, loading } = useAuth(); // NEW: Get auth state from context

  React.useEffect(() => {
    console.log('[ProContext] useEffect fired! loading:', loading, 'user:', user?.id || 'null');
    
    if (loading) {
      console.log('[ProContext] Still loading auth, waiting...');
      return; // Wait for auth to be ready
    }
    
    if (!user) {
      console.log('[ProContext] No user found, setting isPro=false');
      setIsPro(false);
      return;
    }
    
    const sb = createBrowserSupabaseClient();
    
    // Check Pro status - DATABASE IS SOURCE OF TRUTH
    (async () => {
      try {
        const { data: profile, error } = await sb
          .from('profiles')
          .select('is_pro')
          .eq('id', user.id)
          .single();
        
        // TEMPORARY DEBUG LOGGING
        console.log('[ProContext] User ID:', user.id);
        console.log('[ProContext] Profile query result:', { profile, error });
        console.log('[ProContext] Metadata pro:', user.user_metadata?.pro);
        
        if (error) {
          console.error('[ProContext] Failed to fetch Pro status from database:', error);
          // Fallback to metadata if database query fails
          const md: any = user.user_metadata || {};
          const fallbackPro = Boolean(md?.is_pro || md?.pro);
          console.log('[ProContext] Using metadata fallback, isPro:', fallbackPro);
          setIsPro(fallbackPro);
          return;
        }
        
        // Database is the single source of truth
        const profileIsPro = Boolean(profile?.is_pro);
        console.log('[ProContext] Final isPro from database:', profileIsPro);
        setIsPro(profileIsPro);
      } catch (err) {
        console.error('[ProContext] Unexpected error:', err);
        setIsPro(false);
      }
    })();
  }, [user, loading]);

  return (
    <ProContext.Provider value={{ isPro }}>
      {children}
    </ProContext.Provider>
  );
}
