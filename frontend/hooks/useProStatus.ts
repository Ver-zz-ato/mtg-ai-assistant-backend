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
    
    (async () => {
      try {
        const sb = createBrowserSupabaseClient();
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
    })();
  }, [user, authLoading]);
  
  return { isPro, loading };
}


