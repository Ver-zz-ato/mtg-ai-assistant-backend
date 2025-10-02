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
    (async () => {
      try {
        const { data } = await sb.auth.getUser();
        const md: any = data?.user?.user_metadata || {};
        setIsPro(Boolean(md?.is_pro || md?.pro));
      } catch {}
      try {
        const { data: sub } = sb.auth.onAuthStateChange((_evt, session) => {
          const md: any = (session?.user as any)?.user_metadata || {};
          setIsPro(Boolean(md?.is_pro || md?.pro));
        });
        unsub = sub.subscription;
      } catch {}
    })();
    return () => { try { unsub?.unsubscribe?.(); } catch {} };
  }, []);

  return (
    <ProContext.Provider value={{ isPro }}>
      {children}
    </ProContext.Provider>
  );
}