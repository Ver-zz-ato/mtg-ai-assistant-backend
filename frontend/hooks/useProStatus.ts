'use client';
import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

export function useProStatus() {
  const [isPro, setIsPro] = useState(false);
  const [hasBillingAccount, setHasBillingAccount] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  
  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      setIsPro(false);
      setHasBillingAccount(false);
      setLoading(false);
      return;
    }
    
    const sb = createBrowserSupabaseClient();
    
    // Initial check + real-time subscription for Pro status updates
    const checkProStatus = async () => {
      try {
        // Try browser client first
        const { data: profile, error: profileError } = await sb
          .from('profiles')
          .select('is_pro, stripe_customer_id')
          .eq('id', user.id)
          .single();

        const isProFromProfile = profile?.is_pro === true;
        const isProFromMetadata = user?.user_metadata?.is_pro === true || user?.user_metadata?.pro === true;
        let isProUser = isProFromProfile || isProFromMetadata;
        let hasBilling = !!(profile as { stripe_customer_id?: string } | null)?.stripe_customer_id;

        if (profileError) {
          try {
            const apiRes = await fetch('/api/user/pro-status');
            if (apiRes.ok) {
              const apiData = await apiRes.json();
              if (apiData.ok && apiData.isPro !== undefined) {
                isProUser = apiData.isPro;
              }
              if (apiData.ok && apiData.hasBillingAccount !== undefined) {
                hasBilling = apiData.hasBillingAccount;
              }
            }
          } catch {
            // Fallback to metadata
          }
        }

        setIsPro(isProUser);
        setHasBillingAccount(hasBilling);
      } catch (err) {
        const metadataIsPro = Boolean(user.user_metadata?.is_pro || user.user_metadata?.pro);
        setIsPro(metadataIsPro);
        setHasBillingAccount(false);
      } finally {
        setLoading(false);
      }
    };
    
    // Initial check
    checkProStatus();
    
    // Subscribe to real-time profile changes (e.g., when admin toggles Pro)
    // Wrap in try-catch to handle WebSocket connection errors gracefully
    let channel: ReturnType<typeof sb.channel> | null = null;
    try {
      channel = sb
        .channel(`profile-status-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`,
          },
          (payload) => {
            const profileIsPro = Boolean((payload.new as any)?.is_pro);
            const metadataIsPro = Boolean(user?.user_metadata?.is_pro || user?.user_metadata?.pro);
            setIsPro(profileIsPro || metadataIsPro);
            const sid = (payload.new as any)?.stripe_customer_id;
            if (sid !== undefined) setHasBillingAccount(!!sid);
            setLoading(false);
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
                    channel: `profile-status-${user.id}`,
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
              channel: `profile-status-${user.id}`,
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
  }, [user, authLoading]);

  return { isPro, hasBillingAccount, loading };
}


