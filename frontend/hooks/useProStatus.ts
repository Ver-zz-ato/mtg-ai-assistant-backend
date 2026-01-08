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
          try {
            const apiRes = await fetch('/api/user/pro-status');
            if (apiRes.ok) {
              const apiData = await apiRes.json();
              if (apiData.ok && apiData.isPro !== undefined) {
                isProUser = apiData.isPro;
              }
            }
          } catch (apiErr) {
            // Fallback to metadata
          }
        }
        
        setIsPro(isProUser);
      } catch (err) {
        // Last resort fallback to metadata
        const metadataIsPro = Boolean(user.user_metadata?.is_pro || user.user_metadata?.pro);
        setIsPro(metadataIsPro);
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
  
  return { isPro, loading };
}


