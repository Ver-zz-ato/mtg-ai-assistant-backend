'use client';
import { useState, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

export function useProStatus() {
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user, loading: authLoading } = useAuth();
  
  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      setIsPro(false);
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
          .select('is_pro')
          .eq('id', user.id)
          .single();
        
        // Check multiple sources for Pro status (same logic as SupportForm - OR between profile and metadata)
        const isProFromProfile = profile?.is_pro === true;
        const isProFromMetadata = user?.user_metadata?.is_pro === true || user?.user_metadata?.pro === true;
        let isProUser = isProFromProfile || isProFromMetadata;
        
        // If browser query failed, try server-side API fallback (uses same auth, may bypass RLS issues)
        if (profileError) {
          console.warn('[useProStatus] Browser query error, trying server-side API:', profileError.message);
          try {
            const apiRes = await fetch('/api/user/pro-status');
            if (apiRes.ok) {
              const apiData = await apiRes.json();
              if (apiData.ok && apiData.isPro !== undefined) {
                isProUser = apiData.isPro;
                console.info('[useProStatus] Server-side API fallback:', {
                  isPro: apiData.isPro,
                  fromProfile: apiData.fromProfile,
                  fromMetadata: apiData.fromMetadata
                });
              }
            }
          } catch (apiErr) {
            console.warn('[useProStatus] Server-side API fallback failed, using metadata:', apiErr);
          }
        }
        
        setIsPro(isProUser);
        
        console.info('[useProStatus] Pro status determined:', {
          userId: user.id,
          fromProfile: isProFromProfile,
          fromMetadata: isProFromMetadata,
          final: isProUser,
          hadError: !!profileError
        });
      } catch (err) {
        console.error('[useProStatus] Unexpected error:', err);
        // Last resort fallback to metadata
        const metadataIsPro = Boolean(user.user_metadata?.is_pro || user.user_metadata?.pro);
        setIsPro(metadataIsPro);
        console.info('[useProStatus] Using metadata fallback after error:', metadataIsPro);
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
            // Profile was updated - refresh Pro status (check both profile and metadata)
            const profileIsPro = Boolean((payload.new as any)?.is_pro);
            const metadataIsPro = Boolean(user?.user_metadata?.is_pro || user?.user_metadata?.pro);
            const newIsPro = profileIsPro || metadataIsPro;
            setIsPro(newIsPro);
            setLoading(false);
            console.info('[useProStatus] Pro status updated via real-time', { 
              fromProfile: profileIsPro,
              fromMetadata: metadataIsPro,
              final: newIsPro 
            });
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.info('[useProStatus] Realtime subscription active');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[useProStatus] Realtime subscription error:', status);
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
      console.error('[useProStatus] Failed to subscribe to realtime updates:', error);
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
          console.warn('[useProStatus] Error removing channel:', error);
        }
      }
    };
  }, [user, authLoading]);
  
  return { isPro, loading };
}


