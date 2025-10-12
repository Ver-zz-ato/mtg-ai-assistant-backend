import { NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { ChatPostSchema } from "@/lib/validate";
import { ok, err } from "@/app/api/_utils/envelope";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEV = process.env.NODE_ENV !== "production";

// simple 10-min cache for rules hints
// eslint-disable-next-line no-var
var __rulesHintCache: Map<string,{note:string;ts:number}> = (globalThis as any).__rulesHintCache || new Map();
(globalThis as any).__rulesHintCache = __rulesHintCache;

function firstOutputText(json: any): string | null {
  if (!json) return null;
  
  // OpenAI chat completions format
  const maybe = json?.choices?.[0]?.message?.content;
  if (typeof maybe === "string" && maybe.trim()) return maybe.trim();
  
  // Fallback for other formats
  if (typeof json.output_text === "string" && json.output_text.trim()) {
    return json.output_text.trim();
  }
  
  return null;
}

async function callOpenAI(userText: string, sys?: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { fallback: true, text: `Echo: ${userText}` };
  }

  const baseModel = (process.env.OPENAI_MODEL || MODEL || "gpt-4o-mini").trim();
  const fallbackModel = (process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini").trim();

  async function invoke(model: string, tokens: number) {
    const messages: any[] = [];
    if (sys && sys.trim()) {
      messages.push({ role: "system", content: sys });
    }
    messages.push({ role: "user", content: userText });
    
    const body: any = {
      model,
      messages,
      max_tokens: Math.max(16, tokens|0),
      temperature: 1,
    };
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json, status: res.status } as const;
  }

  // Budget caps enforcement (simple): optional config llm_budget { daily_usd?, weekly_usd? }
  try {
    const supabase = await getServerSupabase();
    const { data: cfg } = await supabase.from('app_config').select('value').eq('key','llm_budget').maybeSingle();
    const caps: any = (cfg as any)?.value || null;
    if (caps && (caps.daily_usd || caps.weekly_usd)) {
      const now = new Date();
      const sinceDay = new Date(now.getTime() - 24*60*60*1000).toISOString();
      const sinceWeek = new Date(now.getTime() - 7*24*60*60*1000).toISOString();
      let day = 0, week = 0;
      try { const { data } = await getServerSupabase().then(s=>s.from('ai_usage').select('cost_usd, created_at').gte('created_at', sinceDay)); day = (data||[]).reduce((s,r)=>s+Number((r as any).cost_usd||0),0); } catch {}
      try { const { data } = await getServerSupabase().then(s=>s.from('ai_usage').select('cost_usd, created_at').gte('created_at', sinceWeek)); week = (data||[]).reduce((s,r)=>s+Number((r as any).cost_usd||0),0); } catch {}
      if ((caps.daily_usd && day >= Number(caps.daily_usd)) || (caps.weekly_usd && week >= Number(caps.weekly_usd))) {
        return err('llm_budget_exceeded', 'budget_exceeded', 429);
      }
    }
  } catch {}

  // First attempt with configured model
  let attempt = await invoke(baseModel, 384);

  // If failed, examine error and retry once with adjusted params or fallback model
  if (!attempt.ok) {
    const msg = String(attempt.json?.error?.message || attempt.json?.message || "").toLowerCase();
    const tokenErr = /max_output_tokens|minimum value|below minimum|at least 16/.test(msg);
    const modelErr = /model|not found|access|does not exist|invalid/.test(msg);
    if (tokenErr) {
      attempt = await invoke(baseModel, 64);
    }
    // Retry once with fallback model if first attempt (or token retry) failed
    if (!attempt.ok) {
      const different = fallbackModel && fallbackModel !== baseModel;
      if (different) {
        attempt = await invoke(fallbackModel, 256);
      }
    }
  }

  if (!attempt.ok) {
    const msg = attempt.json?.error?.message || attempt.json?.message || `OpenAI error (${attempt.status})`;
    return { fallback: true, text: `Echo: ${userText}`, error: msg };
  }
  const json = attempt.json;
  if (DEV) console.log("[responses.json]", JSON.stringify(json).slice(0, 2000));

  let out = firstOutputText(json) ?? "";
  if (!out || out.trim() === userText.trim()) {
    out = "";
  }

  const usage = (() => {
    try {
      const u = (json as any)?.usage || {};
      const i = Number(u.prompt_tokens ?? u.input_tokens ?? 0);
      const o = Number(u.completion_tokens ?? u.output_tokens ?? 0);
      return { input_tokens: isFinite(i) ? i : 0, output_tokens: isFinite(o) ? o : 0 };
    } catch { return { input_tokens: 0, output_tokens: 0 }; }
  })();

  return { fallback: false, text: String(out || "").trim(), usage } as any;
}

// Guest mode constants
const GUEST_MESSAGE_LIMIT = 20;

// Check if guest user has exceeded message limit
async function checkGuestMessageLimit(guestMessageCount: number): Promise<{ allowed: boolean; count: number }> {
  const allowed = guestMessageCount < GUEST_MESSAGE_LIMIT;
  return { allowed, count: guestMessageCount };
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let status = 200;
  let userId: string | null = null;
  let isGuest = false;
  
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    // Accept { text } and legacy { prompt }
    const raw = await req.json().catch(() => ({}));
    
    if (!user) {
      // Allow guest users with message limits
      const guestMessageCount = parseInt(raw?.guestMessageCount || '0', 10);
      const guestCheck = await checkGuestMessageLimit(guestMessageCount);
      if (!guestCheck.allowed) {
        status = 401;
        return err(`Please sign in to continue chatting. You've reached the 20 message limit for guest users.`, "guest_limit_reached", 401);
      }
      isGuest = true;
      userId = null;
    } else {
      userId = user.id;
    }

    // Only check rate limits for authenticated users
    if (!isGuest && userId) {
      const rl = await checkRateLimit(supabase as any, userId);
      if (!rl.ok) {
        status = 429;
        return err(rl.error || "rate limited", "rate_limited", status);
      }
    }
    const inputText = typeof raw?.prompt === "string" ? raw.prompt : raw?.text;
    const normalized = { text: inputText, threadId: raw?.threadId };
    const parse = ChatPostSchema.safeParse(normalized);
    const prefs = raw?.prefs || raw?.preferences || null; // optional UX prefs from client
    const context = raw?.context || null; // optional structured context: { deckId, budget, colors }
    const looksSearch = typeof inputText === 'string' && /^(?:show|find|search|cards?|creatures?|artifacts?|enchantments?)\b/i.test(inputText.trim());
    let suppressInsert = !!looksSearch;
    if (!parse.success) { status = 400; return err(parse.error.issues[0].message, "bad_request", 400); }
    const { text, threadId } = parse.data;

    let tid = threadId ?? null;
    let created = false;
    
    if (isGuest) {
      // Guests don't get persistent threads - we'll just process their message
      tid = null;
      created = false;
    } else if (!tid) {
      const title = text.slice(0, 60).replace(/\s+/g, " ").trim();
      // Enforce max 30 threads per user
      const { count, error: cErr } = await supabase
        .from("chat_threads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!);
      if (cErr) { status = 500; return err(cErr.message, "db_error", 500); }
      if ((count ?? 0) >= 30) { status = 400; return err("Thread limit reached (30). Please delete a thread before creating a new one.", "thread_limit", status); }

      const { data, error } = await supabase
        .from("chat_threads")
        .insert({ user_id: userId!, title })
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
        .eq("user_id", userId!)
        .single();
      if (error || !data) { status = 404; return err("thread not found", "not_found", 404); }
    }

    if (!raw?.noUserInsert && !isGuest && tid) {
      await supabase.from("chat_messages")
        .insert({ thread_id: tid, role: "user", content: text });
    }

    // If this thread is linked to a deck, include a compact summary as context
    let sys = "You are ManaTap AI, a concise, budget-aware Magic: The Gathering assistant. Answer succinctly with clear steps when advising.";
    // Persona seed (minimal/async)
    let persona_id = 'any:optimized:plain';
    const teachingFlag = !!(prefs && (prefs.teaching === true));
    try {
      const { selectPersonaAsync, selectPersona } = await import("@/lib/ai/persona");
      const baseInput = { format: typeof prefs?.format==='string' ? prefs?.format : undefined, budget: typeof prefs?.budget==='string' ? prefs?.budget : (typeof prefs?.plan==='string' ? prefs?.plan : undefined), teaching: teachingFlag } as const;
      let p: any = null;
      try { p = await selectPersonaAsync(baseInput as any); } catch {}
      if (!p) p = selectPersona(baseInput as any);
      persona_id = p.id;
      sys = p.seed + "\n\n" + sys;
    } catch {}
    if (context) {
      try { const ctx = JSON.stringify(context).slice(0, 500); sys += `\n\nClient context (JSON): ${ctx}`; } catch {}
    }
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
      try { const { captureServer } = await import("@/lib/server/analytics");
        if (created) await captureServer("thread_created", { thread_id: tid, user_id: userId });
        await captureServer("chat_sent", { provider: "ack", ms: Date.now() - t0, thread_id: tid, user_id: userId, persona_id });
      } catch {}
      return ok({ text: outText, threadId: tid, provider: "ack" });
    }

    // Very light moderation pass (profanity guard)
    try {
      const bad = /\b(fuck|shit|slur|rape|nazi)\b/i.test(String(text||''));
      if (bad) { return err('content_blocked', 'blocked', 400); }
    } catch {}

    // Multi-agent lite: research -> answer -> review (tight timeouts)
    const stageT0 = Date.now();
    let researchNote = '';
    try {
      const kw = (text||'').toLowerCase();
      const looksRules = /\b(rule|stack|priority|lifelink|flying|trample|hexproof|ward|legendary|commander|state[- ]based)\b/.test(kw);
      if (looksRules) {
        const key = ['lifelink','flying','hexproof','trample','ward','legendary','commander','state-based'].find(k=>kw.includes(k)) || 'rules';
        const cached = __rulesHintCache.get(key);
        if (cached && (Date.now()-cached.ts) < 10*60*1000) {
          researchNote = cached.note;
        } else {
          const base = new URL(req.url).origin;
          const r = await fetch(`${base}/rules/index.json`, { cache:'force-cache' });
          const idx:any[] = await r.json().catch(()=>[]);
          const hit = idx.find(x => String(x.text||'').toLowerCase().includes(key.replace('state-based','state-based')));
          if (hit) {
            researchNote = `Rule hint: ${hit.rule} — ${hit.text}`;
            __rulesHintCache.set(key, { note: researchNote, ts: Date.now() });
          }
        }
      }
    } catch {}
    try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer('stage_time_research', { ms: Date.now()-stageT0 }); } catch {}

    const stage1T = Date.now();
    const out1 = await callOpenAI(text, sys + (researchNote?`\n\nResearch: ${researchNote}`:''));
    try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer('stage_time_answer', { ms: Date.now()-stage1T, persona_id }); } catch {}

    let outText = typeof (out1 as any)?.text === "string" ? (out1 as any).text : String(out1 || "");

    const stage2T = Date.now();
    const review = await callOpenAI(outText, 'You are a reviewer. Tighten and clarify the user-facing answer, keep it accurate and brief.');
    try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer('stage_time_review', { ms: Date.now()-stage2T, persona_id }); } catch {}
    if (typeof (review as any)?.text === 'string' && (review as any).text.trim()) outText = (review as any).text.trim();

    // If model produced a preference question, replace it with a neutral acknowledgement
    if (/what format is the deck and roughly what budget/i.test(outText || "")) {
      outText = "Okay — noted. How can I help you improve or analyze this deck?";
    }

    if (!outText || outText.trim().length === 0) {
      // Avoid asking the user to restate preferences; provide a neutral acknowledgement instead
      outText = "Okay — noted. How can I help you improve or analyze this deck?";
    }

    // Replace a just-emitted fallback question with prefs-ack if it slipped through
    // If provider fell back (no API key or upstream error), emit a friendly offline notice instead of silence
    const isEcho = /^\s*echo:/i.test(String(outText || ''));
    if ((out1 as any)?.fallback || isEcho) {
      outText = "Sorry — the AI service is temporarily unavailable in this environment. I can still help with search helpers and deck tools. Try again later or ask a specific question.";
    }
    try {
      if (!suppressInsert) {
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
      }
    } catch {
      if (!suppressInsert) {
        await supabase.from("chat_messages").insert({ thread_id: tid!, role: "assistant", content: outText });
      }
    }

    const provider = (out1 as any)?.fallback ? "fallback" : "openai";

    // Log knowledge gaps: empty outputs or fallback provider
    try {
      if (!outText || provider === 'fallback') {
        const supabase = await getServerSupabase();
        await supabase.from('knowledge_gaps').insert({ route: '/api/chat', reason: (!outText ? 'empty_output' : 'fallback'), prompt: text, details: { threadId: tid } });
      }
    } catch {}

    // AI usage + cost tracking (best effort)
    try {
      const u = (out1 as any)?.usage || {};
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
      try {
        await supabase.from("ai_usage").insert({ user_id: userId, thread_id: tid, model: MODEL, input_tokens: it, output_tokens: ot, cost_usd: cost, persona_id, teaching: teachingFlag });
      } catch {
        await supabase.from("ai_usage").insert({ user_id: userId, thread_id: tid, model: MODEL, input_tokens: it, output_tokens: ot, cost_usd: cost });
      }
    } catch {}

    // Server analytics (no-op if key missing)
    try {
      const { captureServer } = await import("@/lib/server/analytics");
      if (created) await captureServer("thread_created", { thread_id: tid, user_id: userId });
      await captureServer("chat_sent", { provider, ms: Date.now() - t0, thread_id: tid, user_id: userId, persona_id });
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

