'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

export type ModelTier = 'guest' | 'free' | 'pro';

export type ProStatus = {
  isPro: boolean;
  hasBillingAccount: boolean;
  modelTier: ModelTier;
  modelLabel: string;
  upgradeMessage: string | null;
  loading: boolean;
};

/** Until auth resolves, avoid implying "Guest" (signed-out) — no upsell until we know. */
const defaultProStatus: ProStatus = {
  isPro: false,
  hasBillingAccount: false,
  modelTier: 'free',
  modelLabel: 'Standard',
  upgradeMessage: null,
  loading: true,
};

const ProStatusContext = createContext<ProStatus>(defaultProStatus);

/** Single source of truth for Pro / model tier (one Supabase realtime channel per signed-in user). */
export function useProStatus(): ProStatus {
  return useContext(ProStatusContext);
}

export type ProContextValue = { isPro: boolean };

export function usePro(): ProContextValue {
  const { isPro } = useContext(ProStatusContext);
  return { isPro };
}

export default function ProProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ProStatus>(defaultProStatus);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setStatus({
        isPro: false,
        hasBillingAccount: false,
        modelTier: 'guest',
        modelLabel: 'Guest',
        upgradeMessage: 'Sign in for a better model. Upgrade to Pro for the best.',
        loading: false,
      });
      return;
    }

    // Signed in: clear any stale guest UI while profile + API resolve.
    setStatus({
      isPro: false,
      hasBillingAccount: false,
      modelTier: 'free',
      modelLabel: 'Standard',
      upgradeMessage: null,
      loading: true,
    });

    const sb = createBrowserSupabaseClient();

    const checkProStatus = async () => {
      try {
        const { data: profile, error: profileError } = await sb
          .from('profiles')
          .select('is_pro, stripe_customer_id')
          .eq('id', user.id)
          .single();

        const isProFromProfile = profile?.is_pro === true;
        const isProFromMetadata =
          user?.user_metadata?.is_pro === true || user?.user_metadata?.pro === true;
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
              // Never downgrade Pro resolved from profile if API tier drifts.
              if (apiData.ok && apiData.modelTier != null && !isProUser) {
                tier = apiData.modelTier;
                label = apiData.modelLabel ?? label;
                message = apiData.upgradeMessage ?? message;
              }
            }
          } catch {
            // Keep tier/label/message from profile
          }
        }

        if (isProUser) {
          tier = 'pro';
          label = 'Pro';
          message = null;
        } else if (tier === 'pro') {
          tier = 'free';
          label = 'Standard';
          message = message ?? 'Upgrade to Pro for the best model.';
        }

        setStatus({
          isPro: isProUser,
          hasBillingAccount: hasBilling,
          modelTier: tier,
          modelLabel: label,
          upgradeMessage: message,
          loading: false,
        });
      } catch {
        const metadataIsPro = Boolean(user.user_metadata?.is_pro || user.user_metadata?.pro);
        setStatus({
          isPro: metadataIsPro,
          hasBillingAccount: false,
          modelTier: metadataIsPro ? 'pro' : 'free',
          modelLabel: metadataIsPro ? 'Pro' : 'Standard',
          upgradeMessage: metadataIsPro ? null : 'Upgrade to Pro for the best model.',
          loading: false,
        });
      }
    };

    void checkProStatus();

    let channel: ReturnType<typeof sb.channel> | null = null;
    try {
      channel = sb
        .channel(`pro-status-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`,
          },
          (payload) => {
            const profileIsPro = Boolean((payload.new as { is_pro?: boolean })?.is_pro);
            const metadataIsPro = Boolean(
              user?.user_metadata?.is_pro || user?.user_metadata?.pro
            );
            const sid = (payload.new as { stripe_customer_id?: string })?.stripe_customer_id;
            setStatus((prev) => ({
              ...prev,
              isPro: profileIsPro || metadataIsPro,
              hasBillingAccount:
                sid !== undefined ? !!sid : prev.hasBillingAccount,
              modelTier: profileIsPro || metadataIsPro ? 'pro' : 'free',
              modelLabel: profileIsPro || metadataIsPro ? 'Pro' : 'Standard',
              upgradeMessage:
                profileIsPro || metadataIsPro ? null : 'Upgrade to Pro for the best model.',
              loading: false,
            }));
          }
        )
        .subscribe((subStatus) => {
          if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT' || subStatus === 'CLOSED') {
            if (typeof window !== 'undefined') {
              try {
                import('@/lib/secure-connections')
                  .then(({ logConnectionError }) => {
                    logConnectionError(`Subscription ${subStatus}`, {
                      type: 'supabase-realtime',
                      channel: `pro-status-${user.id}`,
                      status: subStatus,
                    });
                  })
                  .catch(() => {});
              } catch {
                /* ignore */
              }
            }
          }
        });
    } catch (error) {
      if (typeof window !== 'undefined') {
        try {
          import('@/lib/secure-connections')
            .then(({ logConnectionError }) => {
              logConnectionError(error, {
                type: 'supabase-realtime',
                channel: `pro-status-${user.id}`,
                operation: 'subscribe',
              });
            })
            .catch(() => {});
        } catch {
          /* ignore */
        }
      }
    }

    return () => {
      if (channel) {
        try {
          sb.removeChannel(channel);
        } catch {
          /* ignore */
        }
      }
    };
  }, [user, authLoading]);

  return <ProStatusContext.Provider value={status}>{children}</ProStatusContext.Provider>;
}
