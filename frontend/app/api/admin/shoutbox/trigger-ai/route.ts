import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { broadcast, pushHistory, type Shout, getHistory } from "@/app/api/shout/hub";
import { callLLM } from "@/lib/ai/unified-llm-client";

export const runtime = "nodejs";
export const maxDuration = 60;

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  const adminUserIds = (process.env.ADMIN_USER_IDS || '').split(',').map(id => id.trim());
  
  return adminEmails.includes(user.email?.toLowerCase() || '') || adminUserIds.includes(user.id);
}

// AI generation prompt
const SYSTEM_PROMPT = `You simulate casual MTG community chat for ManaTap AI (a deck-building website).
Read the recent shoutbox messages and generate 1-3 natural follow-up messages from different users.

RULES:
- Sound like real Magic: The Gathering players: casual, abbreviated, enthusiastic
- Sometimes respond to or reference previous messages, sometimes start new topics
- Vary the energy: questions, excitement, tips, complaints, "gg", sharing wins/losses
- Use realistic usernames (lowercase, sometimes with _mtg, _edh, numbers like 99)
- Keep messages SHORT - usually under 100 characters, max 140
- Reference site features naturally sometimes (mulligan sim, deck analyzer, budget swaps, cost tracker)
- NO corporate speak, NO perfect grammar, NO emoji overload (maybe 1 emoji occasionally)
- Use casual internet speak: "lol", "ngl", "tbh", "imo", "rn", "smh", "haha"
- Occasional typos are fine and feel more real
- NEVER mention being AI, automated, or generated
- NEVER repeat the exact same message from history
- Mix question and statement energy

OUTPUT: Return ONLY a valid JSON array, no other text:
[{"user": "username", "text": "message", "delay_seconds": 0}]

delay_seconds should be 0 for the first message, then 30-90 for subsequent messages to feel natural.`;

type GeneratedMessage = {
  user: string;
  text: string;
  delay_seconds: number;
};

function formatHistoryForAI(history: Shout[]): string {
  if (history.length === 0) {
    return "(No recent messages - start a fresh conversation about MTG/Commander)";
  }
  
  const recent = [...history]
    .sort((a, b) => a.ts - b.ts)
    .slice(-15);
  
  return recent
    .map(m => `${m.user}: ${m.text}`)
    .join("\n");
}

function validateGeneratedMessages(parsed: unknown): GeneratedMessage[] | null {
  if (!Array.isArray(parsed)) return null;
  if (parsed.length === 0 || parsed.length > 5) return null;
  
  const valid: GeneratedMessage[] = [];
  
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    
    const { user, text, delay_seconds } = item as Record<string, unknown>;
    
    if (typeof user !== "string") continue;
    const cleanUser = user.trim().slice(0, 24).toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (cleanUser.length < 2) continue;
    
    if (typeof text !== "string") continue;
    const cleanText = text.trim().slice(0, 200);
    if (cleanText.length < 3) continue;
    
    const delay = typeof delay_seconds === "number" ? Math.max(0, Math.min(delay_seconds, 120)) : 0;
    
    valid.push({
      user: cleanUser,
      text: cleanText,
      delay_seconds: delay,
    });
  }
  
  return valid.length > 0 ? valid : null;
}

// Template fallback data
const firstNames = [
  "Jake", "Sarah", "Mike", "Alex", "Chris", "Emma", "Ryan", "Lily", "Marcus", "Zoe",
  "Tyler", "Maya", "Ethan", "Chloe", "Nathan", "Ava", "Dylan", "Mia", "Caleb", "Ella"
];
const suffixes = ["", "", "", "_mtg", "_edh", "_magic", "99", "_plays"];
const messageTemplates = [
  "what's everyone's favorite budget commander rn?",
  "best place to buy singles these days?",
  "how many lands do you run in aristocrats?",
  "anyone else hyped for the next set?",
  "just built my first reanimator deck, pretty happy with it",
  "the mana base is always the expensive part smh",
  "this deck analyzer saved me so much time",
  "love how the mulligan sim works here",
  "deck just went infinite turn 4 haha",
  "brewing something spicy for friday",
  "edh night tomorrow, can't wait",
  "gg everyone",
  "topdecked the perfect answer lol",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTemplateFallback(): GeneratedMessage[] {
  const name = pickRandom(firstNames).toLowerCase() + pickRandom(suffixes);
  return [{
    user: name,
    text: pickRandom(messageTemplates),
    delay_seconds: 0,
  }];
}

let __lastId = 0;
function nextIdNum(): number {
  const now = Date.now();
  if (now <= __lastId) __lastId += 1; else __lastId = now;
  return __lastId;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    if (!(await isAdmin(supabase))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    
    console.log("[Admin Shoutbox Trigger] Starting AI generation...");
    
    // Get current history
    const history = getHistory();
    
    // Try AI generation
    let messages: GeneratedMessage[] | null = null;
    let usedAI = false;
    
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const historyText = formatHistoryForAI(history);
        
        const response = await callLLM(
          [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Recent shoutbox messages:\n${historyText}\n\nGenerate 1-3 new messages:` }
          ],
          {
            route: "/api/admin/shoutbox/trigger-ai",
            feature: "shoutbox_admin_trigger",
            model: "gpt-4o-mini",
            fallbackModel: "gpt-4o-mini",
            timeout: 20000,
            maxTokens: 400,
            apiType: "chat",
            skipRecordAiUsage: false,
          }
        );
        
        let jsonText = response.text.trim();
        
        // Handle markdown code blocks
        if (jsonText.startsWith("```")) {
          const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (match) jsonText = match[1].trim();
        }
        
        const parsed = JSON.parse(jsonText);
        messages = validateGeneratedMessages(parsed);
        
        if (messages) {
          usedAI = true;
          console.log(`[Admin Shoutbox Trigger] AI generated ${messages.length} message(s)`);
        } else {
          console.log("[Admin Shoutbox Trigger] AI response invalid, using fallback");
        }
      } catch (err: any) {
        console.error("[Admin Shoutbox Trigger] AI error:", err?.message || err);
      }
    } else {
      console.log("[Admin Shoutbox Trigger] No OpenAI API key");
    }
    
    // Fallback to template
    if (!messages) {
      messages = generateTemplateFallback();
      console.log("[Admin Shoutbox Trigger] Using template fallback");
    }
    
    // Check for banned usernames
    const { data: bannedUsers } = await supabase
      .from('banned_shoutbox_users')
      .select('user_name')
      .in('user_name', messages.map(m => m.user));
    
    const bannedSet = new Set((bannedUsers || []).map(b => b.user_name.toLowerCase()));
    
    // Post messages
    const posted: Array<{ user: string; text: string }> = [];
    
    for (const msg of messages) {
      if (bannedSet.has(msg.user.toLowerCase())) {
        console.log(`[Admin Shoutbox Trigger] Skipping banned username: ${msg.user}`);
        continue;
      }
      
      const now_ts = Date.now();
      
      // Persist to database
      const { data: inserted, error: insertError } = await supabase
        .from('shoutbox_messages')
        .insert({
          user_name: msg.user,
          message_text: msg.text,
          is_ai_generated: true,
          created_at: new Date(now_ts).toISOString()
        })
        .select('id')
        .single();
      
      const shoutId = inserted?.id ? Number(inserted.id) : -nextIdNum();
      
      if (insertError) {
        console.warn(`[Admin Shoutbox Trigger] Failed to persist:`, insertError.message);
      } else {
        console.log(`[Admin Shoutbox Trigger] Persisted message ID: ${shoutId}`);
      }
      
      const shout: Shout = {
        id: shoutId,
        user: msg.user,
        text: msg.text,
        ts: now_ts,
      };
      
      pushHistory(shout);
      broadcast(shout);
      posted.push({ user: msg.user, text: msg.text });
    }
    
    console.log(`[Admin Shoutbox Trigger] Posted ${posted.length} message(s) via ${usedAI ? "AI" : "template"}`);
    
    return NextResponse.json({ 
      ok: true,
      method: usedAI ? "ai" : "template",
      count: posted.length,
      messages: posted,
    });
  } catch (e: any) {
    console.error('[Admin Shoutbox Trigger] Error:', e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
