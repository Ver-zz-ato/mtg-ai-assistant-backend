import { NextRequest } from "next/server";
import { createClient } from "@/lib/server-supabase";
import { ChatPostSchema } from "@/lib/validate";
import { ok, err } from "@/lib/envelope";
import { chatRateCheck } from "@/lib/rate";

const MODEL = process.env.OPENAI_MODEL || "gpt-5";
const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEV = process.env.NODE_ENV !== "production";

function firstOutputText(json: any): string | null {
  if (!json) return null;
  if (typeof json.output_text === "string" && json.output_text.trim()) {
    return json.output_text.trim();
  }
  // Responses API canonical path
  try {
    const contents = (json.output ?? [])
      .flatMap((x: any) => Array.isArray(x?.content) ? x.content : [])
      .filter((c: any) => c && typeof c === "object");
    for (const c of contents) {
      if (c.type === "output_text" && typeof c.text === "string" && c.text.trim()) {
        return c.text.trim();
      }
    }
  } catch {}
  // Legacy-ish fallbacks
  const maybe = json?.choices?.[0]?.message?.content;
  if (typeof maybe === "string" && maybe.trim()) return maybe.trim();
  return null;
}

async function callOpenAI(userText: string, sys?: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const body: any = {
    model: MODEL,
    input: [{ role: "user", content: [{ type: "input_text", text: userText }]}],
    max_output_tokens: 384,
    temperature: 1,
  };
  if (sys && sys.trim()) body.instructions = sys;

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || `OpenAI error (${res.status})`;
    throw new Error(msg);
  }
  if (DEV) console.log("[responses.json]", JSON.stringify(json).slice(0, 2000));

  let out = firstOutputText(json) ?? "";
  // Guard against silent echos / empties
  if (!out || out.trim() === userText.trim()) {
    out = "Got it. What format is the deck and roughly what budget are you aiming for?";
  }
  return String(out || "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err("unauthorized", 401);

    const rl = await chatRateCheck(supabase as any, user.id);
    if (!rl.ok) return err(rl.error || "rate limited", rl.status || 429);


    const parse = ChatPostSchema.safeParse(await req.json().catch(() => ({})));
    if (!parse.success) return err(parse.error.issues[0].message, 400);
    const { text, threadId } = parse.data;

    let tid = threadId ?? null;
    if (!tid) {
      const title = text.slice(0, 60).replace(/\s+/g, " ").trim();
      const { data, error } = await supabase
        .from("chat_threads")
        .insert({ user_id: user.id, title })
        .select("id")
        .single();
      if (error) return err(error.message, 500);
      tid = data.id;
    } else {
      const { data, error } = await supabase
        .from("chat_threads")
        .select("id")
        .eq("id", tid)
        .eq("user_id", user.id)
        .single();
      if (error || !data) return err("thread not found", 404);
    }

    await supabase.from("chat_messages")
      .insert({ thread_id: tid!, role: "user", content: text });

    const sys = "You are MTG Coach, a concise, budget-aware Magic: The Gathering assistant. Answer succinctly with clear steps when advising.";
    const outText = await callOpenAI(text, sys);

    await supabase.from("chat_messages")
      .insert({ thread_id: tid!, role: "assistant", content: outText });

    return ok({ text: outText, threadId: tid });
  } catch (e: any) {
    return err(e?.message || "server_error", 500);
  }
}
// --- RATE LIMIT (softlaunch): per-user 1-min and 24h caps using existing tables ---
async function checkRateLimit(supabase: any, userId: string) {
  const oneMinAgo = new Date(Date.now() - 60*1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24*60*60*1000).toISOString();

  const { data: threads } = await supabase.from("chat_threads").select("id").eq("user_id", userId);
  const ids = (threads || []).map((t:any) => t.id);
  if (ids.length === 0) return { ok: true };

  const { count: c1 } = await supabase
    .from("chat_messages")
    .select("*", { count: "exact", head: true })
    .in("thread_id", ids)
    .eq("role", "user")
    .gte("created_at", oneMinAgo);

  const { count: c2 } = await supabase
    .from("chat_messages")
    .select("*", { count: "exact", head: true })
    .in("thread_id", ids)
    .eq("role", "user")
    .gte("created_at", oneDayAgo);

  if ((c1 || 0) > 20) return { ok: false, error: "Too many messages. Please slow down (20/min limit)." };
  if ((c2 || 0) > 500) return { ok: false, error: "Daily message limit reached (500/day)." };
  return { ok: true };
}

