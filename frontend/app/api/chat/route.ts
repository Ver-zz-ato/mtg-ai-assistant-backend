import { NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { ChatPostSchema } from "@/lib/validate";
import { ok, err } from "@/app/api/_utils/envelope";
import type { SfCard } from "@/lib/deck/inference";
import { COMMANDER_PROFILES } from "@/lib/deck/archetypes";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEV = process.env.NODE_ENV !== "production";

const COMMANDER_BANNED: Record<string, true> = {
  "Ancestral Recall": true,
  "Balance": true,
  "Biorhythm": true,
  "Black Lotus": true,
  "Channel": true,
  "Emrakul, the Aeons Torn": true,
  "Falling Star": true,
  "Fastbond": true,
  "Flash": true,
  "Gifts Ungiven": true,
  "Golos, Tireless Pilgrim": true,
  "Griselbrand": true,
  "Hullbreacher": true,
  "Iona, Shield of Emeria": true,
  "Kokusho, the Evening Star": true,
  "Leovold, Emissary of Trest": true,
  "Library of Alexandria": true,
  "Limited Resources": true,
  "Mox Emerald": true,
  "Mox Jet": true,
  "Mox Pearl": true,
  "Mox Ruby": true,
  "Mox Sapphire": true,
  "Painter's Servant": true,
  "Panoptic Mirror": true,
  "Paradox Engine": true,
  "Primeval Titan": true,
  "Prophet of Kruphix": true,
  "Recurring Nightmare": true,
  "Sundering Titan": true,
  "Sway of the Stars": true,
  "Sylvan Primordial": true,
  "Time Vault": true,
  "Time Walk": true,
  "Tinker": true,
  "Tolarian Academy": true,
  "Trade Secrets": true,
  "Upheaval": true,
  "Yawgmoth's Bargain": true,
};

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

type GuardContext = {
  formatHint?: string;
  mentionedBudget?: boolean;
  isCustom?: boolean;
  askedExternal?: boolean;
  askedFeature?: boolean;
  needsProbabilityWrap?: boolean;
};

function guessFormatHint(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  const lower = input.toLowerCase();
  if (/pauper/.test(lower) && /edh/.test(lower)) return "Pauper EDH (100-card singleton)";
  if (/commander|edh/.test(lower)) return "Commander (EDH)";
  if (/brawl/.test(lower)) return "Brawl (60-card singleton)";
  if (/historic/.test(lower)) return "Historic (60-card)";
  if (/pioneer/.test(lower)) return "Pioneer 60-card";
  if (/modern/.test(lower)) return "Modern 60-card";
  if (/standard/.test(lower)) return "Standard 60-card";
  return undefined;
}

function enforceChatGuards(outText: string, ctx: GuardContext = {}): string {
  let text = outText || "";

  if (!/^this looks like|^since you said|^format unclear/i.test(text.trim())) {
    const line = ctx.formatHint
      ? `This looks like ${ctx.formatHint}, so I’ll judge it on that.\n\n`
      : `Format unclear — I’ll assume Commander (EDH) for now.\n\n`;
    text = line + text;
  }

  if (ctx.mentionedBudget && !/budget|cheaper|affordable/i.test(text)) {
    text += `\n\nThese suggestions keep things in a budget-friendly range.`;
  }

  if (ctx.isCustom && !/custom|homebrew/i.test(text)) {
    text = `Since this is a custom/homebrew card, I’ll evaluate it hypothetically.\n\n` + text;
  }

  if (ctx.askedExternal && !/i can[’']?t do that directly here|i cannot do that directly here/i.test(text)) {
    text = `I can’t do that directly here, but here’s the closest workflow:\n\n` + text;
  }

  if (ctx.askedFeature && !/pro|coming soon|not yet|planned|rough|available/i.test(text)) {
    text += `\n\nSome of this lives behind ManaTap Pro or is still coming soon.`;
  }

  if (ctx.needsProbabilityWrap && !/(%|percent|chance|odds)/i.test(text)) {
    text += `\n\nIn plain English: expect this to happen only occasionally — roughly one game out of ten with normal draws.`;
  }

  return text;
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
const GUEST_MESSAGE_LIMIT = 50;
const FREE_USER_DAILY_LIMIT = 50;

// Check if guest user has exceeded message limit
async function checkGuestMessageLimit(guestMessageCount: number): Promise<{ allowed: boolean; count: number }> {
  const allowed = guestMessageCount < GUEST_MESSAGE_LIMIT;
  return { allowed, count: guestMessageCount };
}

// Check if free user has exceeded daily limit
async function checkFreeUserLimit(supabase: any, userId: string): Promise<{ allowed: boolean; count: number }> {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', oneDayAgo);
    
    if (error) {
      console.error('[checkFreeUserLimit] Error:', error);
      return { allowed: true, count: 0 }; // Allow on error
    }
    
    const messageCount = count || 0;
    return { allowed: messageCount < FREE_USER_DAILY_LIMIT, count: messageCount };
  } catch (err) {
    console.error('[checkFreeUserLimit] Exception:', err);
    return { allowed: true, count: 0 };
  }
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
        return err(`Please sign in to continue chatting. You've reached the 50 message limit for guest users.`, "guest_limit_reached", 401);
      }
      isGuest = true;
      userId = null;
    } else {
      userId = user.id;
    }

    // Check Pro status
    let isPro = false;
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_pro')
        .eq('id', userId)
        .single();
      isPro = profile?.is_pro || false;
    }

    // Only check rate limits for authenticated users
    if (!isGuest && userId) {
      const rl = await checkRateLimit(supabase as any, userId);
      if (!rl.ok) {
        status = 429;
        return err(rl.error || "rate limited", "rate_limited", status);
      }
      
      // Check daily limits for free users
      if (!isPro) {
        const freeCheck = await checkFreeUserLimit(supabase, userId);
        if (!freeCheck.allowed) {
          status = 429;
          return err(`You've reached your daily limit of ${FREE_USER_DAILY_LIMIT} messages. Upgrade to Pro for unlimited messages!`, "free_user_limit", 429);
        }
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
    const guardCtx: GuardContext = {
      formatHint: guessFormatHint(text),
      mentionedBudget: /\b(budget|cheap|afford|under\s?\$|under\s?£|kid|price)\b/i.test(String(text || '')),
      isCustom: /\b(custom|homebrew|not a real card)\b/i.test(String(text || '')),
      askedExternal: /\b(crawl|sync|upload|camera|tcgplayer|arena|export|scryfall|tcg player)\b/i.test(String(text || '')),
      askedFeature: /\b(pro\b|feature|support|coming|roadmap|persona|mode)\b/i.test(String(text || '')),
      needsProbabilityWrap: /\b(chance|odds|probability|opening hand|mulligan|draw rate|percent)\b/i.test(String(text || '')),
    };

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

    // Task 1 & 3: Fetch conversation history for RAG and decklist extraction
    let threadHistory: Array<{ role: string; content: string }> = [];
    let pastedDecklistContext = '';
    let ragContext = '';
    
    if (tid && !isGuest) {
      try {
        // Fetch last 30 messages from thread (for RAG and decklist detection)
        // Include the current message we just inserted (it should be in DB now)
        const { data: messages } = await supabase
          .from("chat_messages")
          .select("role, content")
          .eq("thread_id", tid)
          .order("created_at", { ascending: true })
          .limit(30);
        
        if (messages && Array.isArray(messages)) {
          threadHistory = messages;
          
          // Task 1: Extract and analyze pasted decklists from thread history
          // ALWAYS check for decklists, not just when RAG is triggered
          const { isDecklist } = await import("@/lib/chat/decklistDetector");
          const { analyzeDecklistFromText, generateDeckContext } = await import("@/lib/chat/enhancements");
          
          // Find the most recent decklist in conversation history
          // Check all messages, but skip the current message if it's not a decklist
          let foundDecklist = false;
          
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            // Skip the current message if it's not a decklist (to avoid analyzing the question "what's wrong")
            const isCurrentMessage = msg.content === text || (i === messages.length - 1 && msg.role === 'user');
            if (isCurrentMessage && !isDecklist(msg.content)) {
              continue;
            }
            
            if (msg.role === 'user' && msg.content) {
              const isDeck = isDecklist(msg.content);
              
              if (isDeck) {
                // Found a decklist - analyze it
                const problems = analyzeDecklistFromText(msg.content);
                // Always include decklist context, even if no problems found
                pastedDecklistContext = generateDeckContext(problems, 'Pasted Decklist', msg.content);
                if (pastedDecklistContext) {
                  foundDecklist = true;
                  break; // Use the most recent decklist
                }
              }
            }
          }
          
          // Task 3: Basic RAG - Simple keyword matching for relevant context
          // Only include if query seems to reference past conversation
          const queryLower = text.toLowerCase();
          const needsContext = /\b(this|that|it|the deck|my deck|the list|above|previous|earlier|before|mentioned)\b/i.test(queryLower) ||
                              /\b(what.*wrong|problem|issue|improve|suggest|recommend|swap|add|remove)\b/i.test(queryLower);
          
          if (needsContext && messages.length > 1) {
            // Find relevant messages (simple keyword matching)
            const relevantMessages: Array<{ role: string; content: string }> = [];
            const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3); // Words longer than 3 chars
            
            // Always include decklists in RAG context if found
            for (const msg of messages) {
              if (msg.role === 'user' && msg.content) {
                const msgLower = msg.content.toLowerCase();
                // Check if message contains query keywords or is a decklist
                const hasKeywords = queryWords.some(word => msgLower.includes(word));
                const isDecklistMsg = isDecklist(msg.content);
                
                if (hasKeywords || isDecklistMsg) {
                  relevantMessages.push(msg);
                  if (relevantMessages.length >= 10) break; // Limit to 10 relevant messages
                }
              }
            }
            
            // Build RAG context from relevant messages (include decklist if found)
            if (relevantMessages.length > 0) {
              const ragSnippets = relevantMessages.map((msg, idx) => {
                const preview = msg.content.length > 200 ? msg.content.substring(0, 200) + '...' : msg.content;
                return `[Previous message ${idx + 1}]: ${preview}`;
              });
              ragContext = '\n\nConversation context:\n' + ragSnippets.join('\n');
            }
          }
        }
      } catch (error) {
        // Silently fail - RAG is optional enhancement
        console.warn('Failed to fetch conversation history for RAG:', error);
      }
    }

    // If this thread is linked to a deck, include a compact summary as context
    // Load prompt version from prompt_versions table
    let promptVersionId: string | null = null;
    let sys = `You are ManaTap AI, a concise, budget-aware Magic: The Gathering assistant. Answer succinctly with clear steps when advising.

IMPORTANT: Format every Magic card name in bold markdown like **Sol Ring** so the UI can auto-link it. Do not bold other text. Wrap the name in double brackets elsewhere is no longer required.

If a rules question depends on board state, layers, or replacement effects, give the most likely outcome but remind the user to double-check the official Oracle text.

Maintain a friendly mentor tone. Avoid overconfident words like 'auto-include' or 'must-run'; prefer 'commonly used', 'strong option', or 'fits well if…'.

When MTG communities disagree on guidelines (land counts, ramp density, etc.), share the common range and note that it can be tuned to taste. For Commander, treat 33–37 lands as the normal range for an average curve and 8–12 ramp sources, then mention when you'd go higher or lower.

Global behavioral guardrails (always apply):

1. FORMAT SELF-TAG
- Start the very first line with the format you're assuming. Examples:
  - "This looks like a Commander (EDH) list, so I'll judge it on EDH pillars."
  - "Since you said Modern 60-card, I'll focus on curve and efficiency."
  - "Format unclear — I'll assume Commander (EDH), but tell me if it isn't."

2. COMMANDER PILLARS
- For Commander/EDH decks, always speak to ramp, card draw, interaction/removal, and win conditions.
- When recommending improvements, name at least one EDH-appropriate card per pillar you flag.

3. BUDGET LANGUAGE
- If the user mentions budget/cheap/price/kid/under-$, explicitly say "budget-friendly", "cheaper option", or "affordable alternative" while staying in-color.

4. SYNERGY NARRATION
- Frame swaps around the deck's plan (tokens, lifegain, aristocrats, elfball, spellslinger, voltron, graveyard, etc.).
- Always restate the deck's plan in the first or second sentence of your analysis, e.g. "This looks like a +1/+1 counters midrange deck…" or "Your plan is a Rakdos sacrifice/aristocrats shell…".
- Use wording like "Cut X — it's off-plan for your +1/+1 counters strategy."

5. PROBABILITY ANSWERS
- For odds/hand/draw questions, end with a plain-English percentage line, e.g., "So that's roughly about 12% with normal draws."
- Default to 99–100 cards for Commander, 60 for Standard/Modern unless the user specifies otherwise.

6. CUSTOM/HOMEBREW
- If the user says the card is custom/not real/homebrew, begin with "Since this is a custom/homebrew card, I'll evaluate it hypothetically."
- Never claim you found the card in Scryfall/EDHREC or any database.

7. UNKNOWN OR MISSPELLED CARDS
- If a card name doesn't appear to be recognised or looks misspelled, treat it as a likely real but unknown card and evaluate it generically based on what the user says it does (role, mana value, effect).
- Do not claim it exists in any database if you're not sure; use generic role language instead (removal spell, finisher, ramp piece, etc.).

8. OUT-OF-SCOPE / INTEGRATIONS
- If asked to crawl/sync/upload/fetch external data/export directly, the first sentence must be: "I can't do that directly here, but here's the closest workflow…"
- Then guide them using paste/import/export instructions.

9. PRO FEATURE SURFACING (static map)
- Commander, Modern, Standard analysis: available today.
- Pioneer, Historic, Pauper EDH and other formats: coming soon / planned.
- Hand tester & probability panel: available but Pro-gated in the UI.
- Collection & price tracking: available but still improving.
- Standalone combo finder: not a separate tool right now (rolled into analysis).
- Custom cards: you can create/share them; full in-deck testing is still coming.
- When in doubt, say "coming soon" or "still a bit rough" instead of guaranteeing access.

10. INTERNAL CONSISTENCY
- If you mention a number or guideline, keep it consistent across your explanation and lists. Example: if you say 8–12 ramp cards, do not list 4 or 20 in the same answer.

11. NO DUPLICATE CATEGORIES
- If a card appears in one category, do not repeat it elsewhere.

12. COMMANDER SINGLETON & LANDS
- For Commander/EDH, assume singleton unless the user clearly shows legal exceptions (e.g. **Relentless Rats**, **Shadowborn Apostle**) or specifies a special rule.
- Do not recommend running multiple copies of the same non-exception card in Commander.
- When giving high-level land guidance, treat 33–37 lands as the normal range for a typical Commander deck, then explicitly say when a deck might want more or less (e.g. very low curve, very high ramp, landfall-heavy, etc.).

13. STAPLE POWER CARDS
- Only suggest very popular staples like **Smothering Tithe**, **Rhystic Study**, or similar high-impact cards if they actually fit the deck's stated plan and power level.
- Prefer on-theme, synergistic options over generic staples when giving examples.

14. FAST MANA GUIDANCE (CASUAL VS POWERED LEVELS)
- Never recommend fast mana like **Mana Crypt**, **Mox Diamond**, **Chrome Mox**, **Jeweled Lotus**, or similar high-powered acceleration in casual/budget decks unless the user explicitly asks for high-power, optimized, or cEDH.
- When evaluating a casual deck, explicitly mention that you're avoiding fast mana because it raises the power level beyond typical kitchen-table expectations.

Format-specific guidance:
- Commander: emphasize synergy, politics, and fun factor.
- Modern / Pioneer: emphasize efficiency and curve.
- Standard: emphasize current meta awareness and rotation safety.

When the user asks about 'how much ramp' or 'what ramp to run', use this structure:
Default Commander ramp range: 8–12 ramp sources.
Categories:
- Land-based ramp (**Cultivate**, **Kodama's Reach**, **Nature's Lore**, **Three Visits**)
- Mana rocks (**Sol Ring**, **Arcane Signet**, Talismans, **Commander's Sphere**)
- Mana dorks (**Llanowar Elves**, **Elvish Mystic**, **Birds of Paradise**) — only if green is in the deck.
Do NOT call sorceries 'creature ramp'.
Do NOT list the same category twice.
Only suggest high-power fast mana (**Mana Crypt**, etc.) if the user asks for cEDH/high power.
Do NOT present lands like **Command Tower** or **Fabled Passage** as ramp.

If a card is banned or restricted in the user's chosen format, explicitly mention that it's banned and suggest a legal alternative.

If the commander profile indicates a specific archetype, preserve the deck's flavour and mechanical identity; never recommend cards that contradict its theme unless the user explicitly asks for variety.`;
    
    try {
      const { getPromptVersion } = await import("@/lib/config/prompts");
      const promptVersion = await getPromptVersion("chat");
      if (promptVersion) {
        sys = promptVersion.system_prompt;
        promptVersionId = promptVersion.id;
        console.log(`[chat] ✅ Using prompt version ${promptVersion.version} (${promptVersion.id}) - Length: ${sys.length} chars`);
      } else {
        console.log(`[chat] ⚠️ No prompt version found, using default prompt`);
      }
    } catch (e) {
      console.warn("[chat] Failed to load prompt version, using default:", e);
    }
    
    // Add pasted decklist context if found (Task 1)
    // IMPORTANT: Always include decklist context if found, even without RAG trigger
    if (pastedDecklistContext) {
      sys += "\n\n" + pastedDecklistContext;
    }
    
    // Add RAG context if found (Task 3)
    if (ragContext) {
      sys += ragContext;
    }
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
      
      // Add specific guidance for snapshot requests
      sys += `\n\nFor deck snapshot requests: Use these preferences automatically. Simply ask for the decklist without requesting format/budget/currency details again.`;
    }
    if (teachingFlag) {
      sys += `\n\nTeaching mode formatting:\nIn teaching mode, always answer in 3 parts:\n1. Concept/explanation (what this thing is in MTG terms).\n2. Categorised examples (grouped: land-based ramp, mana rocks, mana dorks, spells, etc.).\n3. Application to this user's deck (how many they should run given colors/curve/commander).\nDo not make the teaching answer shorter than the normal answer.\nWhen teaching beginners, define any MTG jargon the first time it appears ("mana dork" = one-mana creature that taps for mana, "ETB" = enters the battlefield, etc.) and include examples in parentheses.\nMatch examples to the format: Commander should reference staples like **Sol Ring**, **Arcane Signet**, **Cultivate**; Modern should cite efficiency cards such as **Ragavan, Nimble Pilferer**, **Consider**, **Lightning Bolt**; Standard should highlight current rotation-safe staples in that colorset.`;
    }
    // Add inference when deck is linked
    let inferredContext: any = null;
    try {
      const { data: th } = await supabase.from("chat_threads").select("deck_id").eq("id", tid!).maybeSingle();
      const deckIdLinked = th?.deck_id as string | null;
      if (deckIdLinked) {
        // Try to get deck info and cards from deck_cards table (full database, up to 400 cards)
        const { data: d } = await supabase.from("decks").select("title, commander, format").eq("id", deckIdLinked).maybeSingle();
        const { data: allCards } = await supabase.from("deck_cards").select("name, qty").eq("deck_id", deckIdLinked).limit(400);
        
        let deckText = "";
        let entries: Array<{ count: number; name: string }> = [];
        
        if (allCards && Array.isArray(allCards) && allCards.length > 0) {
          // Use deck_cards table (full database, proper structure)
          entries = allCards.map((c: any) => ({ count: c.qty || 1, name: c.name }));
          deckText = entries.map(e => `${e.count} ${e.name}`).join("\n");
          const cardList = allCards.map((c: any) => `${c.qty}x ${c.name}`).join("; ");
          sys += `\n\nDeck context (title: ${d?.title || "linked"}): ${cardList}`;
        } else {
          // Fallback to deck_text field for backward compatibility
          const { data: dFallback } = await supabase.from("decks").select("deck_text,title").eq("id", deckIdLinked).maybeSingle();
          deckText = String(dFallback?.deck_text || "");
          if (deckText) {
            // Parse into entries
            const lines = deckText.replace(/\r/g, "").split("\n").map(s => s.trim()).filter(Boolean);
            const rx = /^(\d+)\s*[xX]?\s*(.+)$/;
            const map = new Map<string, number>();
            for (const l of lines) {
              const m = l.match(rx); if (!m) continue; const q = Math.max(1, parseInt(m[1]||"1",10)); const n = m[2];
              map.set(n, (map.get(n)||0)+q);
            }
            entries = Array.from(map.entries()).map(([name, count]) => ({ count, name }));
            const summary = entries.map(e => `${e.count} ${e.name}`).join(", ");
            sys += `\n\nDeck context (title: ${dFallback?.title || "linked"}): ${summary}`;
          }
        }
        
        // Run inference if we have deck entries
        if (entries.length > 0) {
          try {
            const { inferDeckContext, fetchCard } = await import("@/lib/deck/inference");
            const format = (d?.format || "Commander") as "Commander" | "Modern" | "Pioneer";
            const commander = d?.commander || null;
            const selectedColors: string[] = Array.isArray(prefs?.colors) ? prefs.colors : [];
            
            // Build card name map for inference
            const byName = new Map<string, SfCard>();
            const unique = Array.from(new Set(entries.map(e => e.name))).slice(0, 160);
            const looked = await Promise.all(unique.map(name => fetchCard(name)));
            for (const c of looked) {
              if (c) byName.set(c.name.toLowerCase(), c);
            }
            
            // Infer deck context
            const planPref = typeof prefs?.budget === 'string' ? prefs.budget : (typeof prefs?.plan === 'string' ? prefs.plan : undefined);
            const planOption = planPref === 'Budget' || planPref === 'Optimized' ? (planPref as "Budget" | "Optimized") : undefined;
            const currencyPref = typeof prefs?.currency === 'string' ? (prefs.currency as "USD" | "EUR" | "GBP") : undefined;
            inferredContext = await inferDeckContext(deckText, text, entries, format, commander, selectedColors, byName, { plan: planOption, currency: currencyPref });
            
            const commanderProfile = inferredContext.commander ? COMMANDER_PROFILES[inferredContext.commander] : undefined;
            if (commanderProfile?.archetypeHint) {
              sys += `\n\nCommander plan: ${commanderProfile.archetypeHint}`;
            }
            
            // Add inferred context to system prompt
            sys += `\n\nINFERRED DECK ANALYSIS:\n`;
            sys += `- Format: ${inferredContext.format}\n`;
            sys += `- Colors: ${inferredContext.colors.join(', ') || 'none'}\n`;
            if (inferredContext.commander) {
              sys += `- Commander: ${inferredContext.commander}\n`;
              if (inferredContext.commanderProvidesRamp) {
                sys += `- Commander provides ramp - do NOT suggest generic ramp like Cultivate/Kodama's Reach unless for synergy.\n`;
              }
            }
            if (inferredContext.powerLevel) {
              sys += `- Power level: ${inferredContext.powerLevel}\n`;
              if (inferredContext.powerLevel === 'casual' || inferredContext.powerLevel === 'battlecruiser') {
                sys += `- This is a ${inferredContext.powerLevel} deck - respect the power level and don't optimize too aggressively.\n`;
              }
            }
            if (inferredContext.format !== "Commander") {
              sys += `- WARNING: This is NOT Commander format. Do NOT suggest Commander-only cards like Sol Ring, Command Tower, Arcane Signet.\n`;
              sys += `- Only suggest cards legal in ${inferredContext.format} format.\n`;
            } else {
              sys += `- This is Commander format - do NOT suggest narrow 4-of-y cards. Suggest singleton-viable cards only.\n`;
            }
            sys += `- Do NOT suggest cards that are already in the decklist.\n`;
            if (inferredContext.archetype && inferredContext.protectedRoles) {
              sys += `- Archetype: ${inferredContext.archetype}\n`;
              sys += `- Protected cards (do NOT suggest cutting): ${inferredContext.protectedRoles.slice(0, 5).join(', ')}\n`;
            }
            if (inferredContext.manabaseAnalysis?.isAcceptable) {
              sys += `- Manabase is acceptable - only comment if colors are imbalanced by more than 15%.\n`;
            }
            if (inferredContext.format) {
              guardCtx.formatHint = inferredContext.format === "Commander"
                ? "Commander (EDH)"
                : `${inferredContext.format} 60-card`;
            }
          } catch (error) {
            console.warn('[chat] Failed to infer deck context:', error);
            // Continue without inference - graceful degradation
          }
        }
      }
    } catch {}

    // If prefs exist, short-circuit with an acknowledgement to avoid any fallback question flicker
    // BUT skip this if streaming is being used (to prevent duplicate messages)
    const ackFromPrefs = () => {
      const fmt = typeof prefs?.format === 'string' ? prefs.format : undefined;
      const plan = typeof prefs?.budget === 'string' ? prefs.budget : (typeof prefs?.plan === 'string' ? prefs.plan : undefined);
      const cols = Array.isArray(prefs?.colors) ? prefs?.colors : [];
      const colors = cols && cols.length ? cols.join(', ') : 'any';
      return `Okay — using your preferences (Format: ${fmt || 'unspecified'}, Value: ${plan || 'optimized'}, Colors: ${colors}).`;
    };

    // REMOVED: Preference acknowledgement fallback that returned short generic messages
    // This was causing tests to fail because it bypassed the full AI prompt.
    // Users will now get full AI responses even for simple preference queries.
    // The AI prompt should handle format/budget/color context appropriately.

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
    const reviewPrompt = `You are reviewing the assistant’s draft response.

Enforce these checks and fix the text before returning it:
- If the first line lacks a format self-tag ("This looks like…"/"Since you said…"/"Format unclear…"), prepend one based on the user’s prompt.
- If the user mentioned budget/cheap/price/kid/under-$ and the draft omits words like "budget-friendly"/"cheaper option"/"affordable alternative", add a sentence that includes one.
- If the user asked about odds/probability/opening hands and there is no plain-English percent or chance statement, append one such as "So that’s roughly about 15%."
- If the user asked to crawl/sync/upload/fetch/export external data, ensure the very first sentence is "I can’t do that directly here, but here’s the closest workflow…"
- If the user flagged a custom/homebrew card and the draft didn’t state that, add "Since this is a custom/homebrew card, I’ll evaluate it hypothetically."
- If the user asked about platform features (Pro access, combo finder, Pioneer support, custom testing, etc.), normalize the wording to: available / Pro-only / coming soon / not a separate tool right now / still rough.
Return the corrected answer with concise, user-facing tone.`;
    const review = await callOpenAI(outText, reviewPrompt);
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
    outText = enforceChatGuards(outText, guardCtx);
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

