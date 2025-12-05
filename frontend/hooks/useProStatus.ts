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
        const { data } = await sb
          .from('profiles')
          .select('is_pro')
          .eq('id', user.id)
          .single();
        
        setIsPro(data?.is_pro || false);
      } catch (err) {
        console.error('[useProStatus] Error:', err);
        setIsPro(false);
      } finally {
        setLoading(false);
      }
    };
    
    // Initial check
    checkProStatus();
    
    // Subscribe to real-time profile changes (e.g., when admin toggles Pro)
    const channel = sb
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
          // Profile was updated - refresh Pro status
          const newIsPro = Boolean((payload.new as any)?.is_pro);
          setIsPro(newIsPro);
          setLoading(false);
          console.info('[useProStatus] Pro status updated via real-time', { isPro: newIsPro });
        }
      )
      .subscribe();
    
    return () => {
      sb.removeChannel(channel);
    };
  }, [user, authLoading]);
  
  return { isPro, loading };
}


