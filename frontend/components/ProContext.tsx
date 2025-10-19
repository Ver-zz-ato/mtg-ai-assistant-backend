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
        
        // Check BOTH profile table and user metadata
        const { data: profile } = await sb
          .from('profiles')
          .select('is_pro')
          .eq('id', user.id)
          .single();
        
        const profileIsPro = Boolean(profile?.is_pro);
        const md: any = user?.user_metadata || {};
        const metadataIsPro = Boolean(md?.is_pro || md?.pro);
        
        // Use TRUE from either source (profile OR metadata)
        const finalProStatus = profileIsPro || metadataIsPro;
        
        console.log('🔍 Pro detection:', { 
          userId: user.id, 
          profileIsPro,
          metadataIsPro,
          finalProStatus
        });
        
        console.log('✅ Setting Pro status:', finalProStatus);
        setIsPro(finalProStatus);
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
