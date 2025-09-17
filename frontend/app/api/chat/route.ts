// app/api/chat/route.ts — persist chats to Supabase (threads + messages)
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const started = Date.now();
  console.log("[api/chat] POST start");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[api/chat] 500 Missing OPENAI_API_KEY");
    return new Response(JSON.stringify({ ok:false, error: "Missing OPENAI_API_KEY on the server." }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }

  // Force GPT-5
  const model = "gpt-5";

  type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
  type Body = {
    messages?: ChatMsg[];
    system?: string;
    max_tokens?: number;
    threadId?: string | null;
    title?: string;
  };

  const body = (await req.json().catch(() => ({}))) as Body;

  const systemDefault =
    body.system ??
    "You are MTG Coach. Be concise. For rules, cite CR sections (e.g., CR 702.49a). " +
    "For deck help, explain why and give 2–3 concrete, budget-aware swaps.";

  const messages: ChatMsg[] = [{ role: "system", content: systemDefault }, ...(body.messages ?? [])];

  // Persist: prepare supabase (auth optional — no crash if anon)
  const supabase = await createClient().catch(() => null);
  let userId: string | null = null;
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser();
      userId = data?.user?.id ?? null;
    } catch {}
  }

  // If we have a user, optionally create a thread
  let threadId = body.threadId ?? null;
  if (userId && !threadId) {
    const title = (body.title || (messages.find(m => m.role === "user")?.content || "Chat"))
      .slice(0, 80);
    try {
      const { data, error } = await supabase!
        .from("chat_threads")
        .insert({ user_id: userId, title })
        .select("id")
        .single();
      if (!error) threadId = data?.id ?? null;
    } catch {}
  }

  // Call OpenAI
  const payload: any = {
    model,
    messages,
    max_completion_tokens: body.max_tokens ?? 600
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await r.json().catch(() => ({}));
  const ms = Date.now() - started;

  if (!r.ok) {
    console.error(`[api/chat] ${r.status} in ${ms}ms`, data?.error ?? data);
    const msg = data?.error?.message || `Upstream error from OpenAI (status ${r.status}).`;
    return new Response(JSON.stringify({ ok:false, error: msg, status: r.status }), {
      status: r.status, headers: { "Content-Type": "application/json" }
    });
  }

  let text: string = data?.choices?.[0]?.message?.content ?? "";

  // Append CR links footer if any "CR ###.###" refs exist
  const refs = Array.from(text.matchAll(/CR\s*([0-9]{3}\.[0-9]+[a-z]?)/gi)).map((m) => m[1].toLowerCase());
  const uniq = Array.from(new Set(refs));
  if (uniq.length) {
    const links = uniq.map((r) => `CR ${r.toUpperCase()} — https://mtg.wtf/rules/${r}`).join("\n");
    text = `${text}\n\n— Rules refs —\n${links}`;
  }

  // Persist messages (best-effort; ignore errors)
  if (userId && threadId) {
    try {
      const lastUser = [...(body.messages ?? [])].reverse().find(m => m.role === "user");
      if (lastUser?.content) {
        await supabase!.from("chat_messages").insert({
          thread_id: threadId, role: "user", content: lastUser.content
        });
      }
      await supabase!.from("chat_messages").insert({
        thread_id: threadId, role: "assistant", content: text
      });
    } catch (e) {
      console.warn("[api/chat] persist failed", (e as any)?.message || e);
    }
  }

  console.log(`[api/chat] 200 in ${ms}ms (model=${model})`);
  return new Response(JSON.stringify({ ok:true, text, threadId }), {
    status: 200, headers: { "Content-Type": "application/json" }
  });
}
