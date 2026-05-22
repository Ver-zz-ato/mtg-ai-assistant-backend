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

function isActiveProfilePro(profile: { is_pro?: boolean | null; pro_until?: string | null } | null | undefined): boolean {
  if (profile?.is_pro !== true) return false;
  if (!profile.pro_until) return true;
  const until = new Date(profile.pro_until);
  return !Number.isFinite(until.getTime()) || until.getTime() > Date.now();
}

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
          .select('is_pro, pro_until, stripe_customer_id')
          .eq('id', user.id)
          .single();

        let isProUser = isActiveProfilePro(profile);
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
            // Keep profile-derived status.
          }
        } else {
          try {
            const apiRes = await fetch('/api/user/pro-status');
            if (apiRes.ok) {
              const apiData = await apiRes.json();
              if (apiData.ok && apiData.isPro !== undefined) {
                isProUser = apiData.isPro === true;
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
        setStatus({
          isPro: false,
          hasBillingAccount: false,
          modelTier: 'free',
          modelLabel: 'Standard',
          upgradeMessage: 'Upgrade to Pro for the best model.',
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
            const profileFallbackIsPro = isActiveProfilePro(
              payload.new as { is_pro?: boolean | null; pro_until?: string | null },
            );
            const sid = (payload.new as { stripe_customer_id?: string })?.stripe_customer_id;
            const applyStatus = (
              isProUser: boolean,
              hasBilling: boolean | undefined,
              tier: ModelTier = isProUser ? 'pro' : 'free',
              label = isProUser ? 'Pro' : 'Standard',
              message: string | null = isProUser ? null : 'Upgrade to Pro for the best model.'
            ) => {
              setStatus((prev) => ({
                ...prev,
                isPro: isProUser,
                hasBillingAccount: hasBilling !== undefined ? hasBilling : prev.hasBillingAccount,
                modelTier: isProUser ? 'pro' : tier === 'pro' ? 'free' : tier,
                modelLabel: isProUser ? 'Pro' : label,
                upgradeMessage: isProUser ? null : message,
                loading: false,
              }));
            };

            void (async () => {
              try {
                const apiRes = await fetch('/api/user/pro-status', { cache: 'no-store' });
                if (apiRes.ok) {
                  const apiData = await apiRes.json().catch(() => null);
                  if (apiData?.ok === true) {
                    applyStatus(
                      apiData.isPro === true,
                      apiData.hasBillingAccount,
                      apiData.modelTier,
                      apiData.modelLabel,
                      apiData.upgradeMessage ?? null
                    );
                    return;
                  }
                }
              } catch {}
              applyStatus(profileFallbackIsPro, sid !== undefined ? !!sid : undefined);
            })();
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
