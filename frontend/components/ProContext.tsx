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
    
    // Check Pro status from database
    (async () => {
      try {
        const { data: profile } = await sb
          .from('profiles')
          .select('is_pro')
          .eq('id', user.id)
          .single();
        
        const profileIsPro = Boolean(profile?.is_pro);
        const md: any = user.user_metadata || {};
        const metadataIsPro = Boolean(md?.is_pro || md?.pro);
        
        // Use TRUE from either source (profile OR metadata)
        const finalProStatus = profileIsPro || metadataIsPro;
        setIsPro(finalProStatus);
      } catch {
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
