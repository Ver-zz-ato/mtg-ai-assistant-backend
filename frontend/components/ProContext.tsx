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
    if (loading) return; // Wait for auth to be ready
    
    if (!user) {
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
        
        if (error) {
          console.error('[ProContext] Failed to fetch Pro status from database:', error);
          // Fallback to metadata if database query fails
          const md: any = user.user_metadata || {};
          setIsPro(Boolean(md?.is_pro || md?.pro));
          return;
        }
        
        // Database is the single source of truth
        const profileIsPro = Boolean(profile?.is_pro);
        setIsPro(profileIsPro);
        
        // Log mismatch for debugging (can remove later)
        const md: any = user.user_metadata || {};
        const metadataIsPro = Boolean(md?.is_pro || md?.pro);
        if (profileIsPro !== metadataIsPro) {
          console.warn('[ProContext] Pro status mismatch! Database:', profileIsPro, 'Metadata:', metadataIsPro);
        }
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
