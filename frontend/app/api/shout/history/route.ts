import { getHistory, type Shout } from "../hub";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
  
  // Get messages from database
  let dbMessages: Shout[] = [];
  try {
    const supabase = await createClient();
    const threeDaysAgoISO = new Date(threeDaysAgo).toISOString();
    const { data, error } = await supabase
      .from('shoutbox_messages')
      .select('id, user_name, message_text, created_at')
      .gte('created_at', threeDaysAgoISO)
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
  
  // Add seed messages (negative IDs) from memory
  memoryHistory.filter(msg => msg.id < 0).forEach(msg => {
    messageMap.set(msg.id, msg);
  });
  
  // Add database messages (positive IDs)
  dbMessages.forEach(msg => {
    messageMap.set(msg.id, msg);
  });
  
  // Convert back to array, filter by time, and sort
  const allMessages = Array.from(messageMap.values())
    .filter(msg => msg.ts >= threeDaysAgo)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 100);
  
  return Response.json({ items: allMessages });
}
