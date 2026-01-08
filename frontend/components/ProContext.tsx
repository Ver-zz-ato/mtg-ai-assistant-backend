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
    // Wrap in try-catch to handle WebSocket connection errors gracefully
    let channel: ReturnType<typeof sb.channel> | null = null;
    try {
      channel = sb
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
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            // Log error for debugging (throttled to once per session)
            if (typeof window !== 'undefined') {
              try {
                import('@/lib/secure-connections').then(({ logConnectionError }) => {
                  logConnectionError(`Subscription ${status}`, {
                    type: 'supabase-realtime',
                    channel: `profile-${user.id}`,
                    status,
                  });
                }).catch(() => {});
              } catch {}
            }
          }
        });
    } catch (error) {
      // Fallback: subscription failed, but we already have the initial Pro status
      // The app will continue to work, just without real-time updates
      if (typeof window !== 'undefined') {
        try {
          import('@/lib/secure-connections').then(({ logConnectionError }) => {
            logConnectionError(error, {
              type: 'supabase-realtime',
              channel: `profile-${user.id}`,
              operation: 'subscribe',
            });
          }).catch(() => {});
        } catch {}
      }
    }
    
    return () => {
      if (channel) {
        try {
          sb.removeChannel(channel);
        } catch (error) {
          // Silently fail
        }
      }
    };
  }, [user, loading]);

  return (
    <ProContext.Provider value={{ isPro }}>
      {children}
    </ProContext.Provider>
  );
}
