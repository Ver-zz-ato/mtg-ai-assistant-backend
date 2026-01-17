import { containsProfanity } from "@/lib/profanity";
import { broadcast, pushHistory, type Shout } from "../hub";
import { createClient } from "@/lib/supabase/server";

type Body = { text?: string; user?: string };

const lastByUser = new Map<string, number>();
let __lastId = 0;
function nextIdNum(): number {
  const now = Date.now();
  if (now <= __lastId) __lastId += 1; else __lastId = now;
  return __lastId;
}

export async function POST(req: Request) {
  const { text = "", user = "Anon" } = (await req.json().catch(() => ({}))) as Body;

  const cleanText = String(text).trim().slice(0, 280);
  const cleanUser = String(user).trim().slice(0, 24) || "Anon";

  if (!cleanText) return Response.json({ ok: false, error: "Empty message" }, { status: 400 });
  if (containsProfanity(cleanText)) return Response.json({ ok:false, error: "Please keep it civil." }, { status: 400 });

  const last = lastByUser.get(cleanUser) ?? 0;
  if (Date.now() - last < 5000) {
    return Response.json({ ok:false, error: "Please wait a moment before posting again." }, { status: 429 });
  }
  lastByUser.set(cleanUser, Date.now());

  const ts = Date.now();
  
  // Save to database for persistence (get the ID back)
  let dbId: number | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('shoutbox_messages').insert({
      user_name: cleanUser,
      message_text: cleanText,
      created_at: new Date(ts).toISOString()
    }).select('id').single();
    
    if (!error && data) {
      dbId = Number(data.id);
    }
  } catch (err) {
    console.error('Failed to save shoutbox message to database:', err);
    // Continue anyway - message will still broadcast in-memory with timestamp ID
  }
  
  // Use database ID if available, otherwise use timestamp ID
  const msg: Shout = { 
    id: dbId !== null ? dbId : nextIdNum(), 
    user: cleanUser, 
    text: cleanText, 
    ts 
  };
  
  try {
    pushHistory(msg);
    broadcast(msg);
  } catch (err) {
    console.error('Failed to broadcast shoutbox message:', err);
    return Response.json({ ok: false, error: 'Failed to broadcast message' }, { status: 500 });
  }
  
  return Response.json({ ok: true });
}
