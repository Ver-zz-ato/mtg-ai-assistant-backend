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
  const { user, loading } = useAuth();

  React.useEffect(() => {
    if (loading) {
      return; // Wait for auth to be ready
    }
    
    if (!user) {
      setIsPro(false);
      return;
    }
    
    const sb = createBrowserSupabaseClient();
    
    // Initial check + real-time subscription for Pro status updates
    const checkProStatus = async () => {
      try {
        const { data: profile, error } = await sb
          .from('profiles')
          .select('is_pro')
          .eq('id', user.id)
          .single();
        
        if (error) {
          // Fallback to metadata if database query fails
          const md: any = user.user_metadata || {};
          const fallbackPro = Boolean(md?.is_pro || md?.pro);
          setIsPro(fallbackPro);
          return;
        }
        
        // Database is the single source of truth
        const profileIsPro = Boolean(profile?.is_pro);
        setIsPro(profileIsPro);
      } catch (err) {
        setIsPro(false);
      }
    };
    
    // Initial check
    checkProStatus();
    
    // Subscribe to real-time profile changes (e.g., when admin toggles Pro)
    const channel = sb
      .channel(`profile-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          // Profile was updated - refresh Pro status
          const newIsPro = Boolean((payload.new as any)?.is_pro);
          setIsPro(newIsPro);
          console.info('Pro status updated via real-time subscription', { isPro: newIsPro });
        }
      )
      .subscribe();
    
    return () => {
      sb.removeChannel(channel);
    };
  }, [user, loading]);

  return (
    <ProContext.Provider value={{ isPro }}>
      {children}
    </ProContext.Provider>
  );
}
