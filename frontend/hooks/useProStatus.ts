'use client';
import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

export type ModelTier = 'guest' | 'free' | 'pro';

export function useProStatus() {
  const [isPro, setIsPro] = useState(false);
  const [hasBillingAccount, setHasBillingAccount] = useState(false);
  const [modelTier, setModelTier] = useState<ModelTier>('guest');
  const [modelLabel, setModelLabel] = useState<string>('Guest');
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setIsPro(false);
      setHasBillingAccount(false);
      setModelTier('guest');
      setModelLabel('Guest');
      setUpgradeMessage('Sign in for a better model. Upgrade to Pro for the best.');
      setLoading(false);
      return;
    }

    const sb = createBrowserSupabaseClient();

    const checkProStatus = async () => {
      try {
        const { data: profile, error: profileError } = await sb
          .from('profiles')
          .select('is_pro, stripe_customer_id')
          .eq('id', user.id)
          .single();

        const isProFromProfile = profile?.is_pro === true;
        const isProFromMetadata = user?.user_metadata?.is_pro === true || user?.user_metadata?.pro === true;
        let isProUser = isProFromProfile || isProFromMetadata;
        let hasBilling = !!(profile as { stripe_customer_id?: string } | null)?.stripe_customer_id;
        let tier: ModelTier = isProUser ? 'pro' : 'free';
        let label = isProUser ? 'Pro' : 'Standard';
        let message: string | null = isProUser ? null : 'Upgrade to Pro for the best model.';

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
              if (apiData.ok && apiData.modelTier != null) {
                tier = apiData.modelTier;
                label = apiData.modelLabel ?? label;
                message = apiData.upgradeMessage ?? message;
              }
            }
          } catch {
            // Fallback to metadata
          }
        } else {
          try {
            const apiRes = await fetch('/api/user/pro-status');
            if (apiRes.ok) {
              const apiData = await apiRes.json();
              if (apiData.ok && apiData.modelTier != null) {
                tier = apiData.modelTier;
                label = apiData.modelLabel ?? label;
                message = apiData.upgradeMessage ?? message;
              }
            }
          } catch {
            // Keep tier/label/message from profile
          }
        }

        setModelTier(tier);
        setModelLabel(label);
        setUpgradeMessage(message);
        setIsPro(isProUser);
        setHasBillingAccount(hasBilling);
      } catch (err) {
        const metadataIsPro = Boolean(user.user_metadata?.is_pro || user.user_metadata?.pro);
        setIsPro(metadataIsPro);
        setHasBillingAccount(false);
        setModelTier(metadataIsPro ? 'pro' : 'free');
        setModelLabel(metadataIsPro ? 'Pro' : 'Standard');
        setUpgradeMessage(metadataIsPro ? null : 'Upgrade to Pro for the best model.');
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

  return { isPro, hasBillingAccount, modelTier, modelLabel, upgradeMessage, loading };
}


