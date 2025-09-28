import { NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { ChatPostSchema } from "@/lib/validate";
import { ok, err } from "@/app/api/_utils/envelope";

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
  if (!apiKey) {
    return { fallback: true, text: `Echo: ${userText}` };
  }

  const body: any = {
    model: MODEL,
    input: [{ role: "user", content: [{ type: "input_text", text: userText }]}],
  };
  // GPT-5 (Responses API): use max_output_tokens and temperature = 1
  if ((MODEL || "").toLowerCase().includes("gpt-5")) {
    body.max_output_tokens = 384;
    body.temperature = 1;
  } else {
    // Other models (back-compat)
    body.max_output_tokens = 384;
    body.temperature = 1;
  }
  if (sys && sys.trim()) body.instructions = sys;

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || `OpenAI error (${res.status})`;
    // Fallback echo on provider errors
    return { fallback: true, text: `Echo: ${userText}`, error: msg };
  }
  if (DEV) console.log("[responses.json]", JSON.stringify(json).slice(0, 2000));

  let out = firstOutputText(json) ?? "";
  // Guard against silent echos / empties
  if (!out || out.trim() === userText.trim()) {
    out = ""; // we'll decide a safe fallback at the caller depending on prefs
  }

  // Usage extraction (Responses API commonly includes usage: { input_tokens, output_tokens })
  const usage = (() => {
    try {
      const u = (json as any)?.usage || {};
      const i = Number(u.input_tokens ?? u.prompt_tokens ?? 0);
      const o = Number(u.output_tokens ?? u.completion_tokens ?? 0);
      return { input_tokens: isFinite(i) ? i : 0, output_tokens: isFinite(o) ? o : 0 };
    } catch { return { input_tokens: 0, output_tokens: 0 }; }
  })();

  return { fallback: false, text: String(out || "").trim(), usage } as any;
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let status = 200;
  let userId: string | null = null;
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      status = 401;
      return err("unauthorized", "unauthorized", 401);
    }
    userId = user.id;

    const rl = await checkRateLimit(supabase as any, user.id);
    if (!rl.ok) {
      status = 429;
      return err(rl.error || "rate limited", "rate_limited", status);
    }

    // Accept { text } and legacy { prompt }
    const raw = await req.json().catch(() => ({}));
    const inputText = typeof raw?.prompt === "string" ? raw.prompt : raw?.text;
    const normalized = { text: inputText, threadId: raw?.threadId };
    const parse = ChatPostSchema.safeParse(normalized);
    const prefs = raw?.prefs || raw?.preferences || null; // optional UX prefs from client
    if (!parse.success) { status = 400; return err(parse.error.issues[0].message, "bad_request", 400); }
    const { text, threadId } = parse.data;

    let tid = threadId ?? null;
    let created = false;
    if (!tid) {
      const title = text.slice(0, 60).replace(/\s+/g, " ").trim();
      // Enforce max 30 threads per user
      const { count, error: cErr } = await supabase
        .from("chat_threads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (cErr) { status = 500; return err(cErr.message, "db_error", 500); }
      if ((count ?? 0) >= 30) { status = 400; return err("Thread limit reached (30). Please delete a thread before creating a new one.", "thread_limit", status); }

      const { data, error } = await supabase
        .from("chat_threads")
        .insert({ user_id: user.id, title })
        .select("id")
        .single();
      if (error) { status = 500; return err(error.message, "db_error", 500); }
      tid = data.id;
      created = true;
    } else {
      const { data, error } = await supabase
        .from("chat_threads")
        .select("id")
        .eq("id", tid)
        .eq("user_id", user.id)
        .single();
      if (error || !data) { status = 404; return err("thread not found", "not_found", 404); }
    }

    if (!raw?.noUserInsert) {
      await supabase.from("chat_messages")
        .insert({ thread_id: tid!, role: "user", content: text });
    }

    // If this thread is linked to a deck, include a compact summary as context
    let sys = "You are MTG Coach, a concise, budget-aware Magic: The Gathering assistant. Answer succinctly with clear steps when advising.";
    if (prefs && (prefs.format || prefs.budget || (Array.isArray(prefs.colors) && prefs.colors.length))) {
      const fmt = typeof prefs.format === 'string' ? prefs.format : undefined;
      const plan = typeof prefs.budget === 'string' ? prefs.budget : (typeof prefs.plan === 'string' ? prefs.plan : undefined);
      const cols = Array.isArray(prefs.colors) ? prefs.colors : [];
      const colors = cols && cols.length ? cols.join(',') : 'any';
      sys += `\n\nUser preferences: Format=${fmt || 'unspecified'}, Value=${plan || 'optimized'}, Colors=${colors}. If relevant, assume these without asking.`;
    }
    try {
      const { data: th } = await supabase.from("chat_threads").select("deck_id").eq("id", tid!).maybeSingle();
      const deckIdLinked = th?.deck_id as string | null;
      if (deckIdLinked) {
        const { data: d } = await supabase.from("decks").select("deck_text,title").eq("id", deckIdLinked).maybeSingle();
        const deckText = String(d?.deck_text || "");
        if (deckText) {
          // Quick summary: up to 40 unique lines with quantities
          const lines = deckText.replace(/\r/g, "").split("\n").map(s => s.trim()).filter(Boolean);
          const rx = /^(\d+)\s*[xX]?\s*(.+)$/;
          const map = new Map<string, number>();
          for (const l of lines) {
            const m = l.match(rx); if (!m) continue; const q = Math.max(1, parseInt(m[1]||"1",10)); const n = m[2].toLowerCase();
            map.set(n, (map.get(n)||0)+q);
            if (map.size >= 40) break;
          }
          const summary = Array.from(map.entries()).map(([n,q]) => `${q} ${n}`).join(", ");
          sys += `\n\nDeck context (title: ${d?.title || "linked"}): ${summary}`;
        }
      }
    } catch {}

    // If prefs exist, short-circuit with an acknowledgement to avoid any fallback question flicker
    const ackFromPrefs = () => {
      const fmt = typeof prefs?.format === 'string' ? prefs.format : undefined;
      const plan = typeof prefs?.budget === 'string' ? prefs.budget : (typeof prefs?.plan === 'string' ? prefs.plan : undefined);
      const cols = Array.isArray(prefs?.colors) ? prefs?.colors : [];
      const colors = cols && cols.length ? cols.join(', ') : 'any';
      return `Okay — using your preferences (Format: ${fmt || 'unspecified'}, Value: ${plan || 'optimized'}, Colors: ${colors}).`;
    };

    if (prefs && (prefs.format || prefs.budget || (Array.isArray(prefs.colors) && prefs.colors.length))) {
      const outText = ackFromPrefs();
      await supabase.from("chat_messages").insert({ thread_id: tid!, role: "assistant", content: outText });
      try {
        const { captureServer } = await import("@/lib/server/analytics");
        if (created) await captureServer("thread_created", { thread_id: tid, user_id: user.id });
        await captureServer("chat_sent", { provider: "ack", ms: Date.now() - t0, thread_id: tid, user_id: user.id });
      } catch {}
      return ok({ text: outText, threadId: tid, provider: "ack" });
    }

    const out = await callOpenAI(text, sys);
    let outText = typeof (out as any)?.text === "string" ? (out as any).text : String(out || "");

    // If model produced a preference question, replace it with a neutral acknowledgement
    if (/what format is the deck and roughly what budget/i.test(outText || "")) {
      outText = "Okay — noted. How can I help you improve or analyze this deck?";
    }

    if (!outText || outText.trim().length === 0) {
      // Avoid asking the user to restate preferences; provide a neutral acknowledgement instead
      outText = "Okay — noted. How can I help you improve or analyze this deck?";
    }

    // Replace a just-emitted fallback question with prefs-ack if it slipped through
    try {
      const { data: last } = await supabase
        .from("chat_messages")
        .select("id,role,content,created_at")
        .eq("thread_id", tid!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const asked = typeof last?.content === 'string' && /what format is the deck and roughly what budget/i.test(last.content);
      const isAck = /using your preferences/i.test(outText || '');
      if (last && last.role === 'assistant' && asked && isAck) {
        await supabase.from("chat_messages").update({ content: outText }).eq("id", (last as any).id);
      } else {
        await supabase.from("chat_messages").insert({ thread_id: tid!, role: "assistant", content: outText });
      }
    } catch {
      await supabase.from("chat_messages").insert({ thread_id: tid!, role: "assistant", content: outText });
    }

    const provider = (out as any)?.fallback ? "fallback" : "openai";

    // AI usage + cost tracking (best effort)
    try {
      const u = (out as any)?.usage || {};
      const inputTokens = Number(u.input_tokens || 0);
      const outputTokens = Number(u.output_tokens || 0);
      let it = isFinite(inputTokens) ? inputTokens : 0;
      let ot = isFinite(outputTokens) ? outputTokens : 0;
      if (!it && !ot) {
        // estimate tokens if provider didn't return usage
        const approx = Math.ceil((text?.length || 0) / 4);
        it = approx; ot = Math.ceil((outText?.length || 0) / 4);
      }
      const { costUSD } = await import("@/lib/ai/pricing");
      const cost = costUSD(MODEL, it, ot);
      await supabase.from("ai_usage").insert({ user_id: user.id, thread_id: tid, model: MODEL, input_tokens: it, output_tokens: ot, cost_usd: cost });
    } catch {}

    // Server analytics (no-op if key missing)
    try {
      const { captureServer } = await import("@/lib/server/analytics");
      if (created) await captureServer("thread_created", { thread_id: tid, user_id: user.id });
      await captureServer("chat_sent", { provider, ms: Date.now() - t0, thread_id: tid, user_id: user.id });
    } catch {}

    return ok({ text: outText, threadId: tid, provider });
  } catch (e: any) {
    status = 500;
    return err(e?.message || "server_error", "internal", 500);
  } finally {
    const ms = Date.now() - t0;
    console.log(JSON.stringify({ method: "POST", path: "/api/chat", status, ms, userId }));
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

