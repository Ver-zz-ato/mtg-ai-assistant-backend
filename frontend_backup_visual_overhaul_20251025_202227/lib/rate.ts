// lib/rate.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export async function chatRateCheck(supabase: SupabaseClient, userId: string) {
  try {
    const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: threads } = await supabase
      .from('chat_threads')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(2000);

    const ids = (threads || []).map((t: any) => t.id);
    if (ids.length === 0) return { ok: true };

    const { count: c1 } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .in('thread_id', ids)
      .eq('role', 'user')
      .gte('created_at', oneMinAgo);

    const { count: c2 } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .in('thread_id', ids)
      .eq('role', 'user')
      .gte('created_at', oneDayAgo);

    if ((c1 || 0) > 20) return { ok: false, error: 'Too many messages. Please slow down (20/min limit).', status: 429 };
    if ((c2 || 0) > 500) return { ok: false, error: 'Daily message limit reached (500/day).', status: 429 };
    return { ok: true };
  } catch (e) {
    // Fail open in softlaunch; we don't want server errors to block chat
    return { ok: true };
  }
}
