import { NextRequest } from "next/server";
import { createClient } from "@/lib/server-supabase";
import { ChatPostSchema } from "@/lib/validate";
import { ok, err } from "@/lib/envelope";
import { getAutoTitle } from "@/lib/autotitle";

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

    const parse = ChatPostSchema.safeParse(await req.json().catch(() => ({})));
    if (!parse.success) return err(parse.error.issues[0].message, 400);
    const { text, threadId } = parse.data;

    let tid = threadId ?? null;
    if (!tid) {
      const auto = await getAutoTitle(text).catch(() => null);
      const title = (auto && auto.trim()) ? auto.trim() : text.slice(0, 60).replace(/\s+/g, " ").trim();
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
        .select("id,title")
        .eq("id", tid)
        .eq("user_id", user.id)
        .single();
      if (error || !data) return err("thread not found", 404);
      if (!data.title || !data.title.trim()) {
        const auto = await getAutoTitle(text).catch(() => null);
        const title = (auto && auto.trim()) ? auto.trim() : text.slice(0, 60).replace(/\s+/g, " ").trim();
        await supabase.from("chat_threads").update({ title }).eq("id", tid).eq("user_id", user.id);
      }
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
