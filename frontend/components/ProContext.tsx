'use client';
import React from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export type ProContextValue = { isPro: boolean };
const ProContext = React.createContext<ProContextValue>({ isPro: false });

export function usePro(): ProContextValue {
  return React.useContext(ProContext);
}

export default function ProProvider({ children }: { children: React.ReactNode }) {
  const [isPro, setIsPro] = React.useState(false);

  React.useEffect(() => {
    const sb = createBrowserSupabaseClient();
    let unsub: any;
    
    async function checkProStatus() {
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
          setIsPro(false);
          return;
        }
        
        // First check database for authoritative Pro status
        const { data: profile } = await sb
          .from('profiles')
          .select('is_pro')
          .eq('id', user.id)
          .single();
          
        if (profile) {
          setIsPro(Boolean(profile.is_pro));
        } else {
          // Fallback to user metadata if profile not found
          const md: any = user?.user_metadata || {};
          setIsPro(Boolean(md?.is_pro || md?.pro));
        }
      } catch {
        setIsPro(false);
      }
    }
    
    // Check initially
    checkProStatus();
    
    // Listen for auth changes
    try {
      const { data: sub } = sb.auth.onAuthStateChange((_evt, session) => {
        if (session?.user) {
          checkProStatus();
        } else {
          setIsPro(false);
        }
      });
      unsub = sub.subscription;
    } catch {}
    
    return () => { try { unsub?.unsubscribe?.(); } catch {} };
  }, []);

  return (
    <ProContext.Provider value={{ isPro }}>
      {children}
    </ProContext.Provider>
  );
}
