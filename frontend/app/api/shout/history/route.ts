import { getHistory, type Shout } from "../hub";
import { createClient } from "@/lib/supabase/server";

const RETENTION_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function GET() {
  const cutoffTime = Date.now() - RETENTION_MS;
  const cutoffISO = new Date(cutoffTime).toISOString();
  
  const supabase = await createClient();
  
  // Auto-delete old messages (older than 48 hours)
  try {
    const { error: deleteError, count } = await supabase
      .from('shoutbox_messages')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffISO);
    
    if (deleteError) {
      console.error('Failed to cleanup old shoutbox messages:', deleteError.message);
    } else if (count && count > 0) {
      console.log(`[Shoutbox] Cleaned up ${count} message(s) older than 48 hours`);
    }
  } catch (err) {
    console.error('Shoutbox cleanup error:', err);
  }
  
  // Get messages from database (only within retention window)
  let dbMessages: Shout[] = [];
  try {
    const { data, error } = await supabase
      .from('shoutbox_messages')
      .select('id, user_name, message_text, created_at')
      .gte('created_at', cutoffISO)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (!error && data) {
      dbMessages = data.map(row => ({
        id: Number(row.id),
        user: row.user_name,
        text: row.message_text,
        ts: new Date(row.created_at).getTime()
      }));
    }
  } catch (err) {
    console.error('Failed to load shoutbox messages from database:', err);
  }
  
  // Get in-memory messages (includes seed messages and recent posts)
  const memoryHistory = getHistory();
  
  // Combine and deduplicate (prefer database messages for real ones, keep seed messages from memory)
  const messageMap = new Map<number, Shout>();
  
  // Add seed messages (negative IDs) from memory - only if within retention window
  memoryHistory.filter(msg => msg.id < 0 && msg.ts >= cutoffTime).forEach(msg => {
    messageMap.set(msg.id, msg);
  });
  
  // Add database messages (positive IDs)
  dbMessages.forEach(msg => {
    messageMap.set(msg.id, msg);
  });
  
  // Convert back to array, filter by time, and sort (oldest first, newest at bottom)
  const allMessages = Array.from(messageMap.values())
    .filter(msg => msg.ts >= cutoffTime)
    .sort((a, b) => a.ts - b.ts)
    .slice(-100);
  
  return Response.json({ items: allMessages });
}
