import { NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { ChatPostSchema } from "@/lib/validate";
import { ok, err } from "@/app/api/_utils/envelope";
import type { SfCard } from "@/lib/deck/inference";
import { COMMANDER_PROFILES } from "@/lib/deck/archetypes";
import { logger } from "@/lib/logger";
import { deduplicatedFetch } from "@/lib/api/deduplicator";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { getModelForTier } from "@/lib/ai/model-by-tier";
import { isChatCompletionsModel } from "@/lib/ai/modelCapabilities";
import { buildSystemPromptForRequest, generatePromptRequestId } from "@/lib/ai/prompt-path";
import { FREE_DAILY_MESSAGE_LIMIT, GUEST_MESSAGE_LIMIT, PRO_DAILY_MESSAGE_LIMIT } from "@/lib/limits";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const CHAT_HARDCODED_DEFAULT = "You are ManaTap AI, a concise, budget-aware Magic: The Gathering assistant. When mentioning card names, wrap them in [[Double Brackets]]. Do NOT suggest cards already in the decklist.";
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

/** Map UI-selected format (e.g. "commander") to the same hint string used in responses. */
function prefsFormatToHint(format: string | null | undefined): string | undefined {
  if (!format || typeof format !== "string") return undefined;
  const lower = format.toLowerCase();
  if (lower === "commander") return "Commander (EDH)";
  if (lower === "standard") return "Standard 60-card";
  if (lower === "modern") return "Modern 60-card";
  if (lower === "pioneer") return "Pioneer 60-card";
  if (lower === "pauper") return "Pauper 60-card";
  return format.charAt(0).toUpperCase() + format.slice(1);
}

function enforceChatGuards(outText: string, ctx: GuardContext = {}, hasDeckContext: boolean = false): string {
  let text = outText || "";

  // Skip format guard if we have deck context (format is already known from deck)
  if (!hasDeckContext && !/^this looks like|^since you said|^format unclear/i.test(text.trim())) {
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

type CallOpenAIOpts = {
  deckCardCount?: number;
  stop?: string[];
  /** Layer 0 MINI_ONLY: force model and max_tokens, skip dynamic ceiling */
  forceModel?: string;
  forceMaxTokens?: number;
  /** When true, route records one ai_usage row at the end; skip recording in callLLM */
  skipRecordAiUsage?: boolean;
};

async function callOpenAI(
  userText: string,
  sys?: string,
  useMidTier: boolean = false,
  userId?: string | null,
  isPro?: boolean,
  isGuest?: boolean,
  opts?: CallOpenAIOpts
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { fallback: true, text: `Echo: ${userText}`, actualModel: undefined };
  }

  const tierRes = getModelForTier({
    isGuest: isGuest ?? !userId,
    userId: userId ?? null,
    isPro: isPro ?? false,
  });

  const modelOverride = opts?.forceModel;
  // Cost routing: simple queries → mini, complex (deck analysis, synergy) → full model
  let effectiveModel = modelOverride ?? (useMidTier ? tierRes.model : tierRes.fallbackModel);
  if (!modelOverride && !isChatCompletionsModel(effectiveModel)) {
    console.warn(JSON.stringify({
      tag: "model_rejected_chat",
      route: "/api/chat",
      tier: tierRes.tier,
      model: effectiveModel,
      replacement: tierRes.fallbackModel,
    }));
    effectiveModel = tierRes.fallbackModel;
  }

  const { getDynamicTokenCeiling, CHAT_STOP_SEQUENCES } = await import('@/lib/ai/chat-generation-config');
  const maxTokens = opts?.forceMaxTokens ?? getDynamicTokenCeiling(
    { isComplex: useMidTier, deckCardCount: opts?.deckCardCount ?? 0 },
    false
  );
  const stop = opts?.stop?.length ? opts.stop : CHAT_STOP_SEQUENCES;

  try {
    const { callLLM } = await import('@/lib/ai/unified-llm-client');

    const messages: any[] = [];
    if (sys && sys.trim()) {
      messages.push({ role: "system", content: sys });
    }
    messages.push({ role: "user", content: userText });

    const response = await callLLM(
      messages,
      {
        route: '/api/chat',
        feature: 'chat',
        model: effectiveModel,
        fallbackModel: tierRes.fallbackModel,
        timeout: 30000,
        maxTokens,
        stop,
        apiType: 'chat',
        userId: userId || null,
        isPro: isPro || false,
        retryOn429: false,
        retryOn5xx: false,
        skipRecordAiUsage: opts?.skipRecordAiUsage ?? false,
      }
    );

    return {
      ok: true,
      json: {
        choices: [{
          message: {
            content: response.text
          }
        }],
        usage: {
          prompt_tokens: response.inputTokens,
          completion_tokens: response.outputTokens,
        }
      },
      status: 200,
      fallback: response.fallback,
      actualModel: response.actualModel,
    };
  } catch (error: any) {
    return {
      ok: false,
      json: { error: { message: error?.message || 'OpenAI API call failed' } },
      status: 500,
      fallback: true,
      actualModel: effectiveModel,
    };
  }
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
    return { allowed: messageCount < FREE_DAILY_MESSAGE_LIMIT, count: messageCount };
  } catch (err) {
    logger.error('[checkFreeUserLimit] Exception:', err);
    return { allowed: true, count: 0 };
  }
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let status = 200;
  let userId: string | null = null;
  let isGuest = false;
  let guestToken: string | null = null;
  
  try {
    const supabase = await getServerSupabase();
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
    const { data: { user } } = await supabase.auth.getUser();
    
    // Accept { text } and legacy { prompt }
    const raw = await req.json().catch(() => ({}));
    
    if (!user) {
      // Allow guest users with server-side enforced message limits
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      guestToken = cookieStore.get('guest_session_token')?.value || null;
      
      // Extract IP and User-Agent for token verification/tracking
      const forwarded = req.headers.get('x-forwarded-for');
      const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
      const userAgent = req.headers.get('user-agent') || 'unknown';
      
      // If no token, deny (middleware should have created one, but fail closed)
      if (!guestToken) {
        status = 401;
        return err(`Please sign in to continue chatting. Guest access requires a session token.`, "guest_token_missing", 401);
      }

      // Verify token and check limit server-side
      const { verifyGuestToken } = await import('@/lib/guest-tracking');
      const tokenData = await verifyGuestToken(guestToken);
      
      if (!tokenData) {
        status = 401;
        return err(`Please sign in to continue chatting. Invalid or expired guest session.`, "guest_token_invalid", 401);
      }

      const { checkGuestMessageLimit } = await import('@/lib/api/guest-limit-check');
      const guestCheck = await checkGuestMessageLimit(supabase, guestToken, ip, userAgent);
      if (!guestCheck.allowed) {
        status = 401;
        return err(`Please sign in to continue chatting. You've reached the ${GUEST_MESSAGE_LIMIT} message limit for guest users.`, "guest_limit_reached", 401);
      }
      isGuest = true;
      userId = null;
    } else {
      userId = user.id;
    }

    // Check Pro status (only for authenticated users) - use standardized check
    let isPro = false;
    if (userId) {
      const { checkProStatus } = await import('@/lib/server-pro-check');
      isPro = await checkProStatus(userId);
    }

    // Maintenance mode (defense-in-depth; middleware also blocks)
    const { checkMaintenance } = await import('@/lib/maintenance-check');
    const maint = await checkMaintenance();
    if (maint.enabled) {
      status = 503;
      return err(maint.message, "maintenance", 503);
    }

    // Durable rate limiting (database-backed, persists across restarts)
    // This complements in-memory rate limiting for reliability
    if (!isGuest && userId) {
      // Authenticated users: durable rate limit check
      const { checkDurableRateLimit } = await import('@/lib/api/durable-rate-limit');
      const { hashString } = await import('@/lib/guest-tracking');
      const userKeyHash = `user:${await hashString(userId)}`;
      
      // Rate limits: Free users: 50/day, Pro: 500/day (from shared limits)
      const dailyLimit = isPro ? PRO_DAILY_MESSAGE_LIMIT : FREE_DAILY_MESSAGE_LIMIT;
      const durableLimit = await checkDurableRateLimit(supabase, userKeyHash, '/api/chat', dailyLimit, 1);
      
      if (!durableLimit.allowed) {
        status = 429;
        return err(`You've reached your daily limit of ${dailyLimit} messages. ${isPro ? 'Contact support if you need higher limits.' : 'Upgrade to Pro for more!'}`, "RATE_LIMIT_DAILY", status, { resetAt: durableLimit.resetAt });
      }
      
      // Task 6: Add per-minute rate limiting (10 requests per minute per user)
      // Use separate key for per-minute limits: chat:minute:${userKeyHash}
      // Note: checkDurableRateLimit uses date-based grouping, so per-minute limits are approximate
      // (grouped by day, but separate key prevents interference with daily limits)
      const minuteKeyHash = `chat:minute:${userKeyHash}`;
      const minuteLimit = await checkDurableRateLimit(supabase, minuteKeyHash, '/api/chat', 10, 1/1440); // 1 minute = 1/1440 days
      if (!minuteLimit.allowed) {
        status = 429;
        return err(`Too many requests. Please slow down (10 requests per minute limit).`, "RATE_LIMIT_PER_MINUTE", status, { resetAt: minuteLimit.resetAt });
      }
      
      // In-memory rate limiting (complements durable limit - handles short-term bursts)
      const rl = await checkRateLimit(supabase as any, userId);
      if (!rl.ok) {
        status = 429;
        return err(rl.error || "rate limited", "rate_limited", status);
      }
      
      // Legacy daily limit check (kept for safety, but durable limit above is primary)
      if (!isPro) {
        const freeCheck = await checkFreeUserLimit(supabase, userId);
        if (!freeCheck.allowed) {
          status = 429;
          return err(`You've reached your daily limit of ${FREE_DAILY_MESSAGE_LIMIT} messages. Upgrade to Pro for more!`, "free_user_limit", 429);
        }
      }
    }
    // Guest users: rate limiting handled by checkGuestMessageLimit above (guest_sessions table)
    // No additional durable rate limit needed - guest tracking already enforces 10/day server-side
    const inputText = typeof raw?.prompt === "string" ? raw.prompt : raw?.text;
    const normalized = { text: inputText, threadId: raw?.threadId };
    const parse = ChatPostSchema.safeParse(normalized);
    const prefs = raw?.prefs || raw?.preferences || null; // optional UX prefs from client
    const context = raw?.context || null; // optional structured context: { deckId, budget, colors }
    const forceModel = typeof raw?.forceModel === 'string' && raw.forceModel.trim() ? raw.forceModel.trim() : undefined;
    const looksSearch = typeof inputText === 'string' && /^(?:show|find|search|cards?|creatures?|artifacts?|enchantments?)\b/i.test(inputText.trim());
    let suppressInsert = !!looksSearch;
    if (!parse.success) { status = 400; return err(parse.error.issues[0].message, "bad_request", 400); }
    const { text, threadId } = parse.data;
    const guardCtx: GuardContext = {
      formatHint: prefsFormatToHint(prefs?.format) ?? guessFormatHint(text),
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
      
      // Enforce thread limits: Free: 30, Pro: unlimited
      if (!isPro) {
        const threadLimit = 30;
        const { count, error: cErr } = await supabase
          .from("chat_threads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId!);
        if (cErr) { status = 500; return err(cErr.message, "db_error", 500); }
        if ((count ?? 0) >= threadLimit) {
          status = 400;
          return err(`Thread limit reached (30). Upgrade to Pro for unlimited threads! Please delete a thread before creating a new one.`, "thread_limit", status);
        }
      }
      // Pro users: no thread limit check (unlimited)

      // Create thread
      const { data, error } = await supabase
        .from("chat_threads")
        .insert({ user_id: userId!, title })
        .select("id")
        .single();
      if (error) { status = 500; return err(error.message, "db_error", 500); }
      tid = data.id;
      created = true;
    } else {
      // Verify thread exists and belongs to user
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
    let pastedDeckTextRaw: string | null = null;
    let pastedDecklistForCompose: { deckCards: Array<{ name: string; count?: number }>; commanderName: string | null; colorIdentity: null; deckId?: undefined } | null = null;
    let ragContext = '';
    let deckIdToUse: string | null = null; // Declare here for use later
    let d: any = null; // Deck data
    let entries: Array<{ count: number; name: string }> = []; // Deck entries
    let deckText = ""; // Deck text for inference
    
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
          const { isDecklist, extractCommanderFromDecklistText } = await import("@/lib/chat/decklistDetector");
          const { analyzeDecklistFromText, generateDeckContext } = await import("@/lib/chat/enhancements");
          const { parseDeckText } = await import("@/lib/deck/parseDeckText");
          
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
              // Skip messages that are clearly deck context strings (not pasted decklists)
              if (msg.content.includes('[Deck context]') || msg.content.includes('== DECK CONTEXT ==')) {
                continue;
              }
              
              const isDeck = isDecklist(msg.content);
              
              if (isDeck) {
                pastedDeckTextRaw = msg.content;
                // Found a decklist - analyze it
                const problems = analyzeDecklistFromText(msg.content);
                // Always include decklist context, even if no problems found
                pastedDecklistContext = generateDeckContext(problems, 'Pasted Decklist', msg.content);
                if (pastedDecklistContext) {
                  foundDecklist = true;
                  // So MODULE_GRAVEYARD_RECURSION etc. can attach when no deck linked
                  const parsedEntries = parseDeckText(msg.content).map((e) => ({ name: e.name, count: e.qty }));
                  const commanderName = extractCommanderFromDecklistText(msg.content, text);
                  if (parsedEntries.length >= 6) {
                    pastedDecklistForCompose = { deckCards: parsedEntries, commanderName, colorIdentity: null, deckId: undefined };
                  }
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
    // Get deck context if available
    if (tid && !isGuest) {
      try {
        const { data: th } = await supabase.from("chat_threads").select("deck_id").eq("id", tid).maybeSingle();
        const deckIdLinked = th?.deck_id as string | null;
        deckIdToUse = context?.deckId || deckIdLinked;
        
        if (deckIdToUse) {
          // Try to get deck info and cards from deck_cards table (full database, up to 400 cards)
          const { data: deckData } = await supabase.from("decks").select("title, commander, format, deck_aim").eq("id", deckIdToUse).maybeSingle();
          d = deckData;
          const { data: allCards } = await supabase.from("deck_cards").select("name, qty").eq("deck_id", deckIdToUse).limit(400);
          
          if (allCards && Array.isArray(allCards) && allCards.length > 0) {
            // Use deck_cards table (full database, proper structure)
            entries = allCards.map((c: any) => ({ count: c.qty || 1, name: c.name }));
            deckText = entries.map(e => `${e.count} ${e.name}`).join("\n");
          } else {
            // Fallback to deck_text field for backward compatibility
            const { data: dFallback } = await supabase.from("decks").select("deck_text,title").eq("id", deckIdToUse).maybeSingle();
            deckText = String(dFallback?.deck_text || "");
            if (deckText) {
              // Parse into entries
              const lines = deckText.replace(/\r/g, "").split("\n").map((s: string) => s.trim()).filter(Boolean);
              const rx = /^(\d+)\s*[xX]?\s*(.+)$/;
              const map = new Map<string, number>();
              for (const l of lines) {
                const m = l.match(rx); if (!m) continue; const q = Math.max(1, parseInt(m[1]||"1",10)); const n = m[2];
                map.set(n, (map.get(n)||0)+q);
              }
              entries = Array.from(map.entries()).map(([name, count]) => ({ count, name }));
            }
          }
          
          // Link thread to deck if context.deckId was provided and thread isn't already linked
          if (context?.deckId && tid && !deckIdLinked) {
            try {
              await supabase.from("chat_threads").update({ deck_id: context.deckId }).eq("id", tid);
            } catch {}
          }
          
          // Deck context is injected as DECK CONTEXT block after composeSystemPrompt (see below)
        }
      } catch (error) {
        console.warn('[chat] Failed to fetch deck context:', error);
      }
    }

    // Layer 0: deterministic / mini-only gate (runtime or env LLM_LAYER0=on)
    let layer0Mode: string | null = null;
    let layer0Reason: string | null = null;
    let layer0MiniOnly: { model: string; max_tokens: number } | null = null;
    const hasDeckContextForLayer0 = !!(deckIdToUse && deckText?.trim()) || !!(pastedDeckTextRaw?.trim());
    const runtimeConfig = await (await import('@/lib/ai/runtime-config')).getRuntimeAIConfig(supabase);
    const layer0Enabled = runtimeConfig.flags.llm_layer0 === true;
    if (layer0Enabled) {
      const { layer0Decide } = await import("@/lib/ai/layer0-gate");
      const { getFaqAnswer } = await import("@/lib/ai/static-faq");
      const { checkBudgetStatus } = await import("@/lib/server/budgetEnforcement");
      const status = await checkBudgetStatus(supabase);
      const nearBudgetCap = status.daily_usage_pct >= 90;
      const decision = layer0Decide({
        text,
        hasDeckContext: hasDeckContextForLayer0,
        deckCardCount: null,
        isAuthenticated: !!userId,
        route: "chat",
        nearBudgetCap,
      });
      if (decision.mode === "NO_LLM") {
        let responseText: string;
        if (decision.handler === "need_more_info") {
          if (!text.trim()) {
            responseText = "Please enter your question or paste a decklist.";
          } else {
            responseText =
              "To analyze or improve a deck, please link a deck to this chat or paste your decklist in the message. You can link a deck from the deck selector in the chat header, or paste a list (one card per line, e.g. 1 Sol Ring).";
          }
        } else if (decision.handler === "static_faq") {
          responseText = getFaqAnswer(text) ?? "I don't have a canned answer for that. Try asking in different words or use the full AI.";
        } else if (decision.handler === "off_topic") {
          responseText = "ManaTap is focused on MTG deckbuilding and rules—ask me MTG stuff.";
        } else {
          responseText = "Please enter your question or paste a decklist.";
        }
        if (!suppressInsert && !isGuest && tid) {
          await supabase.from("chat_messages").insert({ thread_id: tid, role: "assistant", content: responseText });
        }
        const { recordAiUsage } = await import("@/lib/ai/log-usage");
        await recordAiUsage({
          user_id: userId ?? null,
          thread_id: tid ?? null,
          model: "none",
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: 0,
          route: "chat",
          request_kind: "NO_LLM",
          context_source: "raw_fallback",
          layer0_mode: "NO_LLM",
          layer0_reason: decision.reason,
          is_guest: isGuest,
          user_tier: isPro ? "pro" : userId ? "free" : "guest",
        });
        return ok({ text: responseText, threadId: tid, provider: "layer0" });
      }
      if (decision.mode === "MINI_ONLY") {
        layer0Mode = "MINI_ONLY";
        layer0Reason = decision.reason;
        layer0MiniOnly = { model: decision.model, max_tokens: decision.max_tokens };
      } else {
        layer0Mode = "FULL_LLM";
        layer0Reason = decision.reason;
      }
    }

    // LLM v2 context (Phase A): summary instead of full decklist. Kill-switch: LLM_V2_CONTEXT=off or runtime forces raw path.
    let v2Summary: import("@/lib/deck/deck-context-summary").DeckContextSummary | null = null;
    let contextSource: "linked_db" | "paste_ttl" | "raw_fallback" = "raw_fallback";
    let summaryTokensEstimate: number | null = null;
    let deckHashForLog: string | null = null;
    const v2ContextEnabled = runtimeConfig.flags.llm_v2_context !== false;
    const v2BuildStart = Date.now();
    if (v2ContextEnabled) {
      try {
        const {
          deckHash,
          buildDeckContextSummary,
          getPasteSummary,
          setPasteSummary,
          estimateSummaryTokens,
        } = await import("@/lib/deck/deck-context-summary");
        if (deckIdToUse && deckText && deckText.trim()) {
          const hash = deckHash(deckText);
          deckHashForLog = hash;
          const admin = (await import("@/app/api/_lib/supa")).getAdmin();
          if (admin) {
            const { data: row } = await admin
              .from("deck_context_summary")
              .select("summary_json")
              .eq("deck_id", deckIdToUse)
              .eq("deck_hash", hash)
              .maybeSingle();
            if (row?.summary_json) {
              v2Summary = row.summary_json as import("@/lib/deck/deck-context-summary").DeckContextSummary;
              contextSource = "linked_db";
            } else {
              v2Summary = await buildDeckContextSummary(deckText, {
                format: (d?.format as "Commander" | "Modern" | "Pioneer") ?? "Commander",
                commander: d?.commander ?? null,
                colors: Array.isArray(d?.colors) ? d.colors : [],
              });
              await admin.from("deck_context_summary").upsert(
                { deck_id: deckIdToUse, deck_hash: hash, summary_json: v2Summary },
                { onConflict: "deck_id,deck_hash" }
              );
              contextSource = "linked_db";
            }
          } else {
            v2Summary = await buildDeckContextSummary(deckText, {
              format: (d?.format as "Commander" | "Modern" | "Pioneer") ?? "Commander",
              commander: d?.commander ?? null,
              colors: Array.isArray(d?.colors) ? d.colors : [],
            });
            contextSource = "raw_fallback";
          }
          summaryTokensEstimate = estimateSummaryTokens(v2Summary);
        } else if (pastedDeckTextRaw && pastedDeckTextRaw.trim()) {
          const hash = deckHash(pastedDeckTextRaw);
          deckHashForLog = hash;
          const cached = getPasteSummary(hash);
          if (cached) {
            v2Summary = cached;
            contextSource = "paste_ttl";
          } else {
            v2Summary = await buildDeckContextSummary(pastedDeckTextRaw, { format: "Commander" });
            setPasteSummary(hash, v2Summary);
            contextSource = "paste_ttl";
          }
          summaryTokensEstimate = estimateSummaryTokens(v2Summary);
        }
        const v2BuildMs = Date.now() - v2BuildStart;
        if (v2Summary && v2BuildMs > 400) {
          console.warn(JSON.stringify({ tag: "slow_summary_build", route: "/api/chat", ms: v2BuildMs }));
          v2Summary = null;
          contextSource = "raw_fallback";
          summaryTokensEstimate = null;
        }
      } catch (e) {
        console.warn("[chat] v2 context build failed, falling back to raw:", e);
      }
    }

    const deckFormat = d?.format ? String(d.format).toLowerCase().replace(/\s+/g, "") : null;
    const formatKey = (typeof prefs?.format === "string" ? prefs.format : null) ?? deckFormat ?? "commander";
    const deckContextForCompose = entries.length && d
      ? { deckCards: entries, commanderName: d.commander ?? null, colorIdentity: null as string[] | null, deckId: deckIdToUse ?? undefined }
      : (pastedDecklistForCompose ?? null);

    const hasDeckContextForTier = !!v2Summary || !!(deckContextForCompose?.deckCards?.length);
    let inferredContext: any = null;
    let persona_id = 'any:optimized:plain';
    const { classifyPromptTier, MICRO_PROMPT, estimateSystemPromptTokens } = await import("@/lib/ai/prompt-tier");
    const tierResult = classifyPromptTier({ text, hasDeckContext: hasDeckContextForTier, deckContextForCompose });
    const selectedTier = tierResult.tier;

    const promptRequestId = generatePromptRequestId();
    const { NO_FILLER_INSTRUCTION } = await import("@/lib/ai/chat-generation-config");
    let promptResult: Awaited<ReturnType<typeof buildSystemPromptForRequest>>;
    let sys: string;
    let promptVersionId: string | null;

    if (selectedTier === "micro") {
      sys = MICRO_PROMPT + "\n\n" + NO_FILLER_INSTRUCTION;
      promptVersionId = null;
      promptResult = { systemPrompt: MICRO_PROMPT, promptPath: "composed", formatKey, modulesAttached: [] };
    } else if (selectedTier === "standard") {
      promptResult = await buildSystemPromptForRequest({
        kind: "chat",
        formatKey,
        deckContextForCompose: null,
        supabase,
        hardcodedDefaultPrompt: CHAT_HARDCODED_DEFAULT,
      });
      sys = promptResult.systemPrompt + "\n\n" + NO_FILLER_INSTRUCTION;
      promptVersionId = promptResult.promptVersionId ?? null;
      const { isDecklist } = await import("@/lib/chat/decklistDetector");
      const last2 = threadHistory.slice(-4).filter((m) => m.role === "user" || m.role === "assistant").slice(-2);
      const redacted = last2.map((m) => {
        const content = typeof m.content === "string" ? m.content : "";
        const label = m.role === "user" ? "User" : "Assistant";
        const body = isDecklist(content) ? "(decklist provided; summarized)" : content;
        return `${label}: ${body}`;
      });
      if (redacted.length > 0) {
        sys += "\n\nRecent conversation (last 2 turns):\n" + redacted.join("\n");
      }
    } else {
      promptResult = await buildSystemPromptForRequest({
        kind: "chat",
        formatKey,
        deckContextForCompose,
        supabase,
        hardcodedDefaultPrompt: CHAT_HARDCODED_DEFAULT,
      });
      sys = promptResult.systemPrompt + "\n\n" + NO_FILLER_INSTRUCTION;
      promptVersionId = promptResult.promptVersionId ?? null;
    }

    const chatTierRes = getModelForTier({ isGuest, userId: userId ?? null, isPro: isPro ?? false });
    let promptLogged = false;
    if (!promptLogged) {
      promptLogged = true;
      const systemPromptTokenEstimate = estimateSystemPromptTokens(sys);
      console.log(JSON.stringify({
        tag: "prompt",
        requestId: promptRequestId,
        promptPath: promptResult.promptPath,
        promptTier: selectedTier,
        systemPromptTokenEstimate: systemPromptTokenEstimate,
        kind: "chat",
        formatKey: promptResult.formatKey ?? formatKey,
        modulesAttachedCount: promptResult.modulesAttached?.length ?? 0,
        promptVersionId: promptResult.promptVersionId ?? null,
        tier: chatTierRes.tier,
        model: chatTierRes.model,
        route: "/api/chat",
        ...(promptResult.error && { compose_failed: true, error_name: promptResult.error.name, error_message: promptResult.error.message }),
      }));
      try {
        const { captureServer } = await import("@/lib/server/analytics");
        if (typeof captureServer === "function") {
          await captureServer("ai_prompt_path", {
            prompt_path: promptResult.promptPath,
            kind: "chat",
            formatKey: promptResult.formatKey ?? formatKey,
            modules_attached_count: promptResult.modulesAttached?.length ?? 0,
            prompt_version_id: promptResult.promptVersionId ?? null,
            tier: chatTierRes.tier,
            model: chatTierRes.model,
            route: "/api/chat",
            request_id: promptRequestId,
          });
        }
      } catch (_) {}
    }

    if (selectedTier === "full" && v2Summary) {
      // For simple queries, shrink card_names: use intent-based top-K or trim to 25 (cost savings, token creep guard)
      const queryLower = (text || '').toLowerCase().trim();
      const looksSimple = /^(what is|what's|show|find|search|cards?|creatures?|artifacts?|enchantments?|is |can |does |will )\b/i.test(queryLower) ||
        /^(is|can|does|will)\s+\w+\s+(a|an|legal|banned|good|bad)\b/i.test(queryLower);
      let cardNamesForPrompt = v2Summary.card_names;
      if (looksSimple) {
        const { getRelevantCardsForIntent } = await import("@/lib/deck/deck-context-summary");
        const relevant = getRelevantCardsForIntent(v2Summary, queryLower);
        if (relevant.length > 0) {
          cardNamesForPrompt = relevant;
        } else if (Array.isArray(v2Summary.card_names) && v2Summary.card_names.length > 25) {
          cardNamesForPrompt = v2Summary.card_names.slice(0, 25);
        }
      }
      const summaryForPrompt = { ...v2Summary, card_names: cardNamesForPrompt };
      sys += `\n\nDECK CONTEXT SUMMARY (v2):\n${JSON.stringify(summaryForPrompt)}\n`;
      sys += `\nDo NOT suggest cards listed in DeckContextSummary.card_names.\n`;
      const { isDecklist } = await import("@/lib/chat/decklistDetector");
      const last6 = threadHistory.slice(-12).filter((m) => m.role === "user" || m.role === "assistant").slice(-6);
      const redacted = last6.map((m) => {
        const content = typeof m.content === "string" ? m.content : "";
        const label = m.role === "user" ? "User" : "Assistant";
        const body = isDecklist(content) ? "(decklist provided; summarized)" : content;
        return `${label}: ${body}`;
      });
      if (redacted.length > 0) {
        sys += "\n\nRecent conversation (last 6 turns):\n" + redacted.join("\n");
      }
    } else if (selectedTier === "full") {
      if (d && deckText && deckText.trim()) {
        sys += `\n\nDECK CONTEXT (YOU ALREADY KNOW THIS - DO NOT ASK OR ASSUME):\n`;
        sys += `- Format: ${deckFormat || formatKey} (this is the deck's format; do NOT say "Format unclear" or "I'll assume")\n`;
        sys += `- Commander: ${d.commander || "none"}\n`;
        sys += `- Deck Title: ${d.title || "Untitled Deck"}\n`;
        sys += `- Full Decklist:\n${deckText}\n`;
        sys += `- IMPORTANT: You already have the complete decklist above. Do NOT ask the user to share or provide the decklist. Start directly with analysis or suggestions.\n`;
        sys += `- Do NOT suggest cards already in the decklist above.\n`;
      }
      if (pastedDecklistContext) {
        sys += "\n\n" + pastedDecklistContext;
      }
    }

    if (selectedTier === "full") {
    // Add RAG context if found (Task 3) - skip when v2 summary used to avoid duplication
    if (ragContext && !v2Summary) {
      sys += ragContext;
    }
    
    // Add conversation summary (conversation memory)
    if (tid && !isGuest && threadHistory.length >= 10) {
      try {
        const { data: thread } = await supabase
          .from('chat_threads')
          .select('summary')
          .eq('id', tid)
          .maybeSingle();
        
        if (thread?.summary) {
          try {
            const summary = JSON.parse(thread.summary);
            const { formatSummaryForPrompt } = await import("@/lib/ai/conversation-summary");
            const formatted = formatSummaryForPrompt(summary);
            if (formatted) {
              sys += formatted;
            }
          } catch {
            // If summary is plain text, use it directly
            sys += `\n\nConversation summary: ${thread.summary}`;
          }
        }
        // Generate summary in background if missing (non-blocking)
        if (!thread?.summary && threadHistory.length >= 10) {
          (async () => {
            try {
              const { buildSummaryPrompt, parseSummary, formatSummaryForPrompt } = await import("@/lib/ai/conversation-summary");
              const summaryPrompt = buildSummaryPrompt(threadHistory);
              const summaryResponse = await callOpenAI(summaryPrompt, "Extract key facts from this conversation.", false, userId, isPro, isGuest);
              const summary = parseSummary(typeof summaryResponse === 'string' ? summaryResponse : (summaryResponse as any)?.text || '');
              
              if (summary) {
                await supabase.from('chat_threads')
                  .update({ summary: JSON.stringify(summary) })
                  .eq('id', tid);
              }
            } catch (error) {
              console.warn('[chat] Background summary generation failed:', error);
            }
          })();
        }
      } catch (error) {
        console.warn('[chat] Conversation summary failed:', error);
      }
    }
    
    // Add format-specific knowledge
    try {
      const { getFormatKnowledge, formatKnowledgeForPrompt } = await import("@/lib/data/format-knowledge");
      const format = typeof prefs?.format === 'string' ? prefs.format : undefined;
      const knowledge = getFormatKnowledge(format);
      if (knowledge) {
        sys += formatKnowledgeForPrompt(knowledge);
      }
    } catch (error) {
      console.warn('[chat] Format knowledge injection failed:', error);
    }
    
    // Add few-shot learning examples
    if (userId && !isGuest) {
      try {
        const { findSimilarExamples, formatExamplesForPrompt } = await import("@/lib/ai/few-shot-learning");
        const examples = await findSimilarExamples(text, undefined, undefined, 2);
        if (examples.length > 0) {
          sys += formatExamplesForPrompt(examples);
        }
      } catch (error) {
        console.warn('[chat] Few-shot learning failed:', error);
      }
    }
    
    // Persona seed (minimal/async)
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
    // Task 7: Optimize system prompts - limit client context to essential fields
    if (context) {
      try { 
        // Only include essential fields to reduce token count
        const essential = {
          deckId: context.deckId,
          budget: context.budget,
          colors: context.colors
        };
        const ctx = JSON.stringify(essential).slice(0, 200); 
        sys += `\n\nClient context: ${ctx}`; 
      } catch {}
    }
    // User preferences: Commander must never use "Colors=any" (enforce color identity)
    if (prefs && (prefs.format || prefs.budget || (Array.isArray(prefs.colors) && prefs.colors.length))) {
      const fmt = typeof prefs.format === 'string' ? prefs.format : undefined;
      const plan = typeof prefs.budget === 'string' ? prefs.budget : (typeof prefs.plan === 'string' ? prefs.plan : undefined);
      const cols = Array.isArray(prefs.colors) ? prefs.colors : [];
      const formatKeyForColors = (typeof prefs?.format === "string" ? prefs.format : null) ?? deckFormat ?? "commander";
      let colors: string;
      if (formatKeyForColors === "commander") {
        colors = cols?.length
          ? `${cols.join(",")} (fixed; do NOT violate)`
          : "commander color identity (infer from commander; do NOT treat as any)";
      } else {
        colors = "not applicable";
      }
      sys += `\n\nUser preferences: Format=${fmt || 'unspecified'}, Value=${plan || 'optimized'}, Colors=${colors}. If relevant, assume these without asking.`;
      if (fmt) {
        sys += ` Do NOT say "Format unclear" or "I'll assume Commander/Standard/…" — the user has already selected a format in the UI; use it.`;
      }
      // Add specific guidance for snapshot requests
      sys += `\n\nFor deck snapshot requests: Use these preferences automatically. Simply ask for the decklist without requesting format/budget/currency details again.`;
    }
    // Task 7: Optimize system prompts - shorten teaching mode formatting
    if (teachingFlag) {
      sys += `\n\nTeaching mode: Answer in 3 parts: 1) Concept/explanation, 2) Categorized examples (land ramp, rocks, dorks), 3) Application to deck. Define jargon first time (ETB=enters battlefield). Match examples to format.`;
    }
    // Formatting: clear spacing and concise output so the UI reads well
    sys += `\n\nFormatting: Use "Step 1", "Step 2" (with a space after Step). Put a space after colons. Keep step-by-step analysis concise; lead with actionable recommendations. Do NOT suggest cards that are already in the decklist.`;
    // Add inference when deck is linked (from thread OR context parameter)
    let inferredContext: any = null;
    if (deckIdToUse && entries.length > 0 && deckText) {
      try {
        const { inferDeckContext, fetchCard } = await import("@/lib/deck/inference");
        const format = (d?.format || "Commander") as "Commander" | "Modern" | "Pioneer";
        const commander = d?.commander || null;
        const deckAim = d?.deck_aim || null;
        const selectedColors: string[] = Array.isArray(prefs?.colors) ? prefs.colors : [];
        
        const byName = new Map<string, SfCard>();
        const unique = Array.from(new Set(entries.map(e => e.name))).slice(0, 160);
        const looked = await Promise.all(unique.map(name => fetchCard(name)));
        for (const c of looked) {
          if (c) byName.set(c.name.toLowerCase(), c);
        }
        
        const planPref = typeof prefs?.budget === 'string' ? prefs.budget : (typeof prefs?.plan === 'string' ? prefs.plan : undefined);
        const planOption = planPref === 'Budget' || planPref === 'Optimized' ? (planPref as "Budget" | "Optimized") : undefined;
        const currencyPref = typeof prefs?.currency === 'string' ? (prefs.currency as "USD" | "EUR" | "GBP") : undefined;
        inferredContext = await inferDeckContext(deckText, text, entries, format, commander, selectedColors, byName, { plan: planOption, currency: currencyPref });
        
        // Use deck_aim from database if available (user-specified or AI-inferred)
        if (deckAim) {
          sys += `\n\nDeck aim/goal (user-specified): ${deckAim}. Use this to guide recommendations and ensure suggestions align with this strategy.`;
        }
        
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
          sys += `- This is Commander format (100 cards singleton) - do NOT suggest narrow 4-of-y cards. Suggest singleton-viable cards only.\n`;
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

    // Task 2: Tighten complex analysis detection - require deck context OR multiple complex keywords
    const queryLower = (text || '').toLowerCase();
    
    // Simple query patterns (negative patterns - these should use mini)
    const isSimpleQuery = 
      // Card name lookups
      /^(what is|what's|show|find|search|cards?|creatures?|artifacts?|enchantments?)\b/i.test(queryLower.trim()) ||
      // Quick single-card questions
      /^(is|can|does|will)\s+\w+\s+(a|an|legal|banned|good|bad)\b/i.test(queryLower.trim());
    
    // Complex analysis requires deck context OR multiple complex indicators
    const hasDeckContext = inferredContext !== null || pastedDecklistContext !== '';
    const complexKeywords = [
      /\b(synergy|how.*work|why.*work|explain|analyze|analysis|strategy|archetype|combo|interaction|engine)\b/i,
      /\b(what.*wrong|improve|suggest|recommend|swap|better|upgrade|optimize)\b/i,
      /\b(why|how does|what makes|how would|why would|what.*best|which.*better)\b/i
    ];
    const complexKeywordCount = complexKeywords.filter(regex => regex.test(queryLower)).length;
    
    // Only use gpt-5 when truly needed: deck context OR 2+ complex keywords (not simple queries)
    const isComplexAnalysis = !isSimpleQuery && (hasDeckContext || complexKeywordCount >= 2);
    
    // Two-tier cache: public (allowlist) or private (scoped). No global shared cache.
    const { hashString, hashGuestToken } = await import('@/lib/guest-tracking');
    const sysPromptHash = await hashString(sys || '');
    const format = typeof prefs?.format === 'string' ? prefs.format : '';
    const commander = inferredContext?.commander || '';
    const hasChatHistory = threadHistory.length > 0;
    const tierLabel = chatTierRes.tier;
    const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

    const { isPublicCacheEligible } = await import('@/lib/ai/cache-allowlist');
    const publicEligible = isPublicCacheEligible({
      hasDeckContext,
      hasChatHistory,
      userMessage: text,
      layer0Handler: layer0Mode === "NO_LLM" ? undefined : layer0Mode ?? undefined,
    });

    let cachedResponse: { text: string; usage?: any; fallback?: boolean } | undefined;
    if (publicEligible) {
      const { hashCacheKey, supabaseCacheGet, normalizeCacheText } = await import('@/lib/utils/supabase-cache');
      const payload = {
        cache_version: 1,
        model: chatTierRes.model,
        sysPromptHash,
        intent: "public",
        normalized_user_text: normalizeCacheText(text, true),
        deck_context_included: false,
        deck_hash: null as string | null,
        tier: tierLabel,
        locale: null as string | null,
      };
      const key = await hashCacheKey(payload);
      try {
        cachedResponse = await supabaseCacheGet(supabase, "ai_public_cache", key);
      } catch (e) {
        if (DEV) console.warn("[chat] Public cache get failed:", e);
      }
    } else {
      // Private cache: scope by user_id → guest token hash → anon session cookie → ip_hash (last resort only)
      let scope: string;
      if (userId) {
        scope = `user:${userId}`;
      } else if (guestToken) {
        scope = `guest:${await hashGuestToken(guestToken)}`;
      } else {
        try {
          const { getOrCreateAnonSessionId } = await import('@/lib/guest-tracking');
          const anonId = await getOrCreateAnonSessionId();
          scope = `anon:${await hashString(anonId)}`;
        } catch {
          scope = `ip:${await hashString(ip)}`;
        }
      }
      const { hashCacheKey, supabaseCacheGet, normalizeCacheText } = await import('@/lib/utils/supabase-cache');
      const payload = {
        cache_version: 1,
        model: chatTierRes.model,
        sysPromptHash,
        intent: "private",
        normalized_user_text: normalizeCacheText(text, false),
        deck_context_included: hasDeckContext,
        deck_hash: v2Summary?.deck_hash ?? null,
        tier: tierLabel,
        locale: null as string | null,
        scope,
      };
      const key = await hashCacheKey(payload);
      try {
        cachedResponse = await supabaseCacheGet(supabase, "ai_private_cache", key);
      } catch (e) {
        if (DEV) console.warn("[chat] Private cache get failed:", e);
      }
    }

    if (cachedResponse) {
      if (DEV) console.log(`[chat] Cache HIT for query: ${text.slice(0, 50)}...`);
      let cachedText = cachedResponse.text || '';
      if (typeof cachedText !== 'string') {
        console.error('❌ [chat] Cached response has non-string text! Type:', typeof cachedText);
        cachedText = '';
      }
      if (!suppressInsert && !isGuest && tid) {
        await supabase.from("chat_messages").insert({ thread_id: tid, role: "assistant", content: cachedText });
      }
      try {
        const { recordAiUsage } = await import("@/lib/ai/log-usage");
        await recordAiUsage({
          user_id: userId ?? null,
          thread_id: tid ?? null,
          model: "cached",
          input_tokens: 0,
          output_tokens: Math.ceil((cachedText?.length || 0) / 4),
          cost_usd: 0,
          route: "chat",
          request_kind: layer0Mode ?? undefined,
          layer0_mode: layer0Mode ?? undefined,
          cache_hit: true,
          cache_kind: publicEligible ? "public" : "private",
          is_guest: isGuest,
          user_tier: tierLabel,
        });
      } catch (_) {}
      return ok({ text: cachedText, threadId: tid, provider: "cached" });
    }

    // Budget cap: block new API calls if daily/weekly limit exceeded (cached responses still allowed above)
    const { allowAIRequest } = await import('@/lib/server/budgetEnforcement');
    const budgetCheck = await allowAIRequest(supabase);
    if (!budgetCheck.allow) {
      status = 429;
      return err(budgetCheck.reason ?? 'AI budget limit reached. Try again later.', 'BUDGET_LIMIT', 429);
    }

    const stage1T = Date.now();
    let sysForCall = sys + (researchNote ? `\n\nResearch: ${researchNote}` : '');
    const deckCardCount = v2Summary?.card_count ?? 0;
    type PlannerUsage = { model: string; inputTokens: number; outputTokens: number; cost_usd: number };
    let plannerUsage: PlannerUsage | null = null;
    // Phase B two-stage: for long-answer deck questions, mini model produces outline then main writes to it.
    // Skip when Layer 0 MINI_ONLY, near budget cap, or predicted output too short (avoids planner overhead).
    const { isLongAnswerRequest, predictOutputTokens, TWO_STAGE_MIN_PREDICTED_TOKENS } = await import('@/lib/ai/chat-generation-config');
    const predictedTokens = predictOutputTokens(text, hasDeckContext, isComplexAnalysis);
    let useTwoStage = selectedTier === "full" && !layer0MiniOnly && isComplexAnalysis && hasDeckContext && isLongAnswerRequest(text) && predictedTokens > TWO_STAGE_MIN_PREDICTED_TOKENS;
    if (useTwoStage) {
      try {
        const { checkBudgetStatus } = await import('@/lib/server/budgetEnforcement');
        const status = await checkBudgetStatus(supabase);
        if (status.daily_usage_pct >= 90) useTwoStage = false;
      } catch (_) {}
    }
    if (useTwoStage) {
      try {
        const { OUTLINE_MAX_TOKENS } = await import('@/lib/ai/chat-generation-config');
        const { callLLM } = await import('@/lib/ai/unified-llm-client');
        const { costUSD } = await import('@/lib/ai/pricing');
        const tierRes = getModelForTier({ isGuest: !!isGuest, userId: userId ?? null, isPro: isPro ?? false });
        const outlineResp = await callLLM(
          [
            { role: 'system', content: 'You are an outline generator for a Magic: The Gathering assistant. Given the user request (they have deck context). Output only a short outline: 3-6 section titles and one line each for what to cover. No prose, no greeting.' },
            { role: 'user', content: text },
          ],
          { route: '/api/chat', feature: 'chat', model: tierRes.fallbackModel, fallbackModel: tierRes.fallbackModel, timeout: 15000, maxTokens: OUTLINE_MAX_TOKENS, apiType: 'chat', userId: userId ?? null, isPro: isPro ?? false, retryOn429: false, retryOn5xx: false, skipRecordAiUsage: true }
        );
        const outline = (outlineResp.text || '').trim();
        if (outline) {
          sysForCall += '\n\nWrite the response strictly following this outline. Do not add filler.\nOutline:\n' + outline;
          const pi = outlineResp.inputTokens ?? 0;
          const po = outlineResp.outputTokens ?? 0;
          plannerUsage = { model: outlineResp.actualModel, inputTokens: pi, outputTokens: po, cost_usd: costUSD(outlineResp.actualModel, pi, po) };
        }
      } catch (e) {
        console.warn('[chat] Two-stage outline failed, continuing without outline:', e);
      }
    }
    let out1: any;
    try {
      const callOpts: CallOpenAIOpts = { deckCardCount, stop: (await import('@/lib/ai/chat-generation-config')).CHAT_STOP_SEQUENCES, skipRecordAiUsage: true };
      if (forceModel) {
        callOpts.forceModel = forceModel;
      } else if (layer0MiniOnly) {
        callOpts.forceModel = layer0MiniOnly.model;
        callOpts.forceMaxTokens = layer0MiniOnly.max_tokens;
      }
      out1 = await callOpenAI(text, sysForCall, layer0MiniOnly ? false : isComplexAnalysis, userId, isPro, isGuest, callOpts);
    } catch (error) {
      // Error recovery: fallback to keyword search
      console.warn('[chat] LLM call failed, attempting recovery:', error);
      const { fallbackToKeywordSearch, getHelpfulErrorMessage } = await import("@/lib/ai/error-recovery");
      const fallback = fallbackToKeywordSearch(text, threadHistory);
      if (fallback.success && fallback.data && fallback.data.length > 0) {
        out1 = { text: fallback.data[0] };
      } else {
        out1 = { text: getHelpfulErrorMessage() };
      }
    }
    try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer('stage_time_answer', { ms: Date.now()-stage1T, persona_id }); } catch {}

    // Extract text from response, handling various response formats (prevents "[object Response]")
    console.log("🔍 [chat] Extracting outText from out1:", {
      out1Type: typeof out1,
      out1Constructor: (out1 as any)?.constructor?.name,
      out1IsResponse: out1 instanceof Response,
      out1Keys: out1 && typeof out1 === 'object' ? Object.keys(out1) : [],
      out1OwnPropertyNames: out1 && typeof out1 === 'object' ? Object.getOwnPropertyNames(out1).slice(0, 10) : [],
      hasText: !!(out1 as any)?.text,
      textType: typeof (out1 as any)?.text,
      textIsFunction: typeof (out1 as any)?.text === 'function',
      textPreview: typeof (out1 as any)?.text === 'string' ? (out1 as any).text.substring(0, 200) : 'not a string',
      out1Stringified: JSON.stringify(out1, (key, value) => {
        if (typeof value === 'function') return '[Function]';
        if (value instanceof Response) return '[Response]';
        return value;
      }, 2).substring(0, 500)
    });
    
    let outText = '';
    
    // CRITICAL FIX: Create a completely clean object copy to avoid prototype pollution
    // If out1 has a function text property, it might be from Response.prototype
    let cleanOut1: any = null;
    if (out1 && typeof out1 === 'object') {
      try {
        // Create a plain object with Object.create(null) to avoid any prototype
        cleanOut1 = Object.create(null);
        // Only copy enumerable, non-function properties
        for (const key in out1) {
          if (Object.prototype.hasOwnProperty.call(out1, key)) {
            const value = (out1 as any)[key];
            if (typeof value !== 'function') {
              cleanOut1[key] = value;
            }
          }
        }
        // Also try JSON serialization/deserialization to get a completely clean copy
        try {
          const serialized = JSON.parse(JSON.stringify(out1, (key, value) => {
            if (typeof value === 'function') return undefined;
            return value;
          }));
          if (serialized && typeof serialized === 'object') {
            cleanOut1 = serialized;
          }
        } catch {}
      } catch (e) {
        console.error('❌ [chat] Failed to create clean copy:', e);
      }
    }
    
    // Use clean copy if available, otherwise original
    const source = cleanOut1 || out1;
    
    // Now extract text from the clean source
    if (typeof (source as any)?.text === "string") {
      outText = (source as any).text;
    } else if (source && typeof source === 'object' && 'text' in source) {
      const textValue = (source as any).text;
      if (typeof textValue === 'function') {
        console.error('❌ [chat] textValue is STILL a function after cleaning! This is a critical bug.');
        outText = '';
      } else {
        outText = String(textValue || '');
      }
    } else if (typeof source === 'string') {
      outText = source;
    } else {
      console.warn('⚠️ [chat] Unexpected out1 structure, using empty string');
      outText = '';
    }
    
    // Ensure outText is a string, not an object or function
    if (typeof outText !== 'string') {
      console.error('❌ [chat] outText is not a string after extraction:', typeof outText, outText);
      outText = String(outText || '');
    }
    
    console.log("✅ [chat] Final outText:", {
      length: outText.length,
      preview: outText.substring(0, 300),
      containsConsumeBody: outText.includes('consumeBody'),
      containsUtf8Decode: outText.includes('utf8DecodeBytes')
    });
    
    // Check if we have deck context BEFORE review (so review doesn't add format unclear)
    const hasLinkedDeckContextBeforeReview = !!deckIdToUse || (!!d && !!d.format);
    
    // Add confidence scoring (non-blocking, runs in parallel with review)
    // Note: Confidence scoring is lightweight and can run async
    // For now, we'll skip it to avoid extra LLM calls, but the infrastructure is ready

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
    console.log("🔍 [chat] Calling review with outText:", {
      outTextLength: outText.length,
      outTextPreview: outText.substring(0, 200),
      reviewPromptLength: reviewPrompt.length
    });
    
    const review = await callOpenAI(outText, reviewPrompt, false, userId, isPro, isGuest);
    
    console.log("🔍 [chat] Review response:", {
      reviewType: typeof review,
      reviewKeys: review && typeof review === 'object' ? Object.keys(review) : [],
      hasText: !!(review as any)?.text,
      textType: typeof (review as any)?.text,
      textIsFunction: typeof (review as any)?.text === 'function',
      textPreview: typeof (review as any)?.text === 'string' ? (review as any).text.substring(0, 200) : 'not a string'
    });
    
    try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer('stage_time_review', { ms: Date.now()-stage2T, persona_id }); } catch {}
    
    // CRITICAL FIX: Create clean copy of review response to avoid function properties
    let cleanReview: any = null;
    if (review && typeof review === 'object') {
      try {
        cleanReview = JSON.parse(JSON.stringify(review, (key, value) => {
          if (typeof value === 'function') return undefined;
          return value;
        }));
      } catch {
        // If JSON serialization fails, create manual copy
        cleanReview = {};
        for (const key in review) {
          if (Object.prototype.hasOwnProperty.call(review, key)) {
            const value = (review as any)[key];
            if (typeof value !== 'function') {
              cleanReview[key] = value;
            }
          }
        }
      }
    }
    
    const reviewSource = cleanReview || review;
    
    // CRITICAL FIX: Check if text is a function (Response object) before using it
    if (typeof (reviewSource as any)?.text === 'function') {
      console.error('❌ [chat] Review returned text as a function even after cleaning! This should not happen.');
      console.warn("⚠️ [chat] Review did not return valid text, keeping original outText");
    } else if (typeof (reviewSource as any)?.text === 'string' && (reviewSource as any).text.trim()) {
      const reviewText = (reviewSource as any).text.trim();
      console.log("✅ [chat] Using review text:", {
        length: reviewText.length,
        preview: reviewText.substring(0, 300),
        containsConsumeBody: reviewText.includes('consumeBody'),
        containsUtf8Decode: reviewText.includes('utf8DecodeBytes')
      });
      outText = reviewText;
    } else {
      console.warn("⚠️ [chat] Review did not return valid text, keeping original outText");
    }
    
    // Ensure outText is still a string after review
    if (typeof outText !== 'string') {
      console.error('❌ [chat] outText after review is not a string:', typeof outText, outText);
      outText = String(outText || '');
    }
    
    // Final check for Response object code
    if (outText.includes('consumeBody') || outText.includes('utf8DecodeBytes') || outText.includes('text() {')) {
      console.error('❌ [chat] DETECTED Response object code in outText! Attempting to clean...');
      // Try to extract just the actual response text before the code
      const codeStart = outText.search(/text\(\)\s*\{|consumeBody|utf8DecodeBytes/);
      if (codeStart > 0) {
        outText = outText.substring(0, codeStart).trim();
        console.log("✅ [chat] Cleaned outText, removed Response object code");
      }
    }

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
    // Check if we have deck context (format is known from deck, not guessed)
    // Use deckIdToUse OR check if format was inferred from deck (not from pasted text)
    const hasLinkedDeckContext = !!deckIdToUse || (!!d && !!d.format);
    outText = enforceChatGuards(outText, guardCtx, hasLinkedDeckContext);
    const { trimOutroLines } = await import("@/lib/chat/outputCleanupFilter");
    outText = trimOutroLines(outText);

    // Runtime validation: format-aware recommendation validator + output cleanup
    const deckCardsForValidate = entries.length > 0 ? entries : (pastedDecklistForCompose?.deckCards ?? []);
    if (deckCardsForValidate.length > 0 && outText && typeof outText === "string") {
      try {
        const formatKeyForValidate = (typeof prefs?.format === "string" ? prefs.format : null) ?? deckFormat ?? "commander";
        const formatKeyVal = (formatKeyForValidate === "modern" || formatKeyForValidate === "pioneer" ? formatKeyForValidate : "commander") as "commander" | "modern" | "pioneer";
        const { validateRecommendations, REPAIR_SYSTEM_MESSAGE } = await import("@/lib/chat/validateRecommendations");
        let result = await validateRecommendations({
          deckCards: deckCardsForValidate.map((c) => ({ name: c.name })),
          formatKey: formatKeyVal,
          colorIdentity: null,
          commanderName: d?.commander ?? pastedDecklistForCompose?.commanderName ?? null,
          rawText: outText,
        });
        if (!result.valid && result.issues.length > 0) {
          if (DEV) console.warn("[chat] Recommendation validation issues:", result.issues.map((i) => i.message));
          outText = result.repairedText;
        }
        // Max 1 retry: re-invoke with repair message when needsRegeneration (atomic replace, no streaming)
        if (result.needsRegeneration) {
          console.log("[chat] regeneration (needsRegeneration) triggered");
          try {
            const regenOut = await callOpenAI(text, sys + "\n\n" + REPAIR_SYSTEM_MESSAGE, isComplexAnalysis, userId, isPro, isGuest);
            const regenText = firstOutputText((regenOut as any)?.json);
            if (typeof regenText === "string" && regenText.trim()) {
              outText = regenText.trim();
              result = await validateRecommendations({
                deckCards: deckCardsForValidate.map((c) => ({ name: c.name })),
                formatKey: formatKeyVal,
                colorIdentity: null,
                commanderName: d?.commander ?? pastedDecklistForCompose?.commanderName ?? null,
                rawText: outText,
                isRegenPass: true,
              });
              if (!result.valid && result.issues.length > 0) outText = result.repairedText;
            }
          } catch (regenErr) {
            if (DEV) console.warn("[chat] regeneration request failed:", regenErr);
          }
        }
        const { applyOutputCleanupFilter, stripIncompleteSynergyChains, stripIncompleteTruncation, applyBracketEnforcement } = await import("@/lib/chat/outputCleanupFilter");
        outText = stripIncompleteSynergyChains(outText);
        outText = stripIncompleteTruncation(outText);
        outText = applyOutputCleanupFilter(outText);
        outText = applyBracketEnforcement(outText);
        if (DEV) {
          const { humanSanityCheck } = await import("@/lib/chat/humanSanityCheck");
          const flags = humanSanityCheck(outText);
          if (!flags.feelsHuman || flags.instructionalPhrases.length > 0)
            console.warn("[chat] humanSanityCheck flags:", flags);
        }
      } catch (e) {
        if (DEV) console.warn("[chat] validateRecommendations/cleanup error:", e);
      }
    }

    // Debug logging for local dev
    if (DEV) {
      console.log('[chat] Response:', {
        hasDeckContext,
        hasLinkedDeckContext,
        deckIdToUse,
        format: d?.format || 'unknown',
        cardCount: entries.length,
        outTextLength: outText.length,
        outTextPreview: outText.substring(0, 200)
      });
    }
    
    // Task 1: Cache successful responses for 1 hour
    // Cache successful responses (two-tier: public or private)
    if (outText && typeof outText === 'string' && outText.length > 0 && !(out1 as any)?.fallback) {
      const usage = (out1 as any)?.usage || {};
      const cacheValue = { text: String(outText), usage: usage || {}, fallback: false };
      try {
        const { hashCacheKey, supabaseCacheSet, normalizeCacheText } = await import('@/lib/utils/supabase-cache');
        let cacheScope: string;
        if (userId) cacheScope = `user:${userId}`;
        else if (guestToken) cacheScope = `guest:${await hashGuestToken(guestToken)}`;
        else {
          try {
            const { getOrCreateAnonSessionId } = await import('@/lib/guest-tracking');
            cacheScope = `anon:${await hashString(await getOrCreateAnonSessionId())}`;
          } catch {
            cacheScope = `ip:${await hashString(ip)}`;
          }
        }
        const payload = publicEligible
          ? {
              cache_version: 1,
              model: chatTierRes.model,
              sysPromptHash,
              intent: "public",
              normalized_user_text: normalizeCacheText(text, true),
              deck_context_included: false,
              deck_hash: null as string | null,
              tier: tierLabel,
              locale: null as string | null,
            }
          : {
              cache_version: 1,
              model: chatTierRes.model,
              sysPromptHash,
              intent: "private",
              normalized_user_text: normalizeCacheText(text, false),
              deck_context_included: hasDeckContext,
              deck_hash: v2Summary?.deck_hash ?? null,
              tier: tierLabel,
              locale: null as string | null,
              scope: cacheScope,
            };
        const key = await hashCacheKey(payload);
        await supabaseCacheSet(
          supabase,
          publicEligible ? "ai_public_cache" : "ai_private_cache",
          key,
          cacheValue,
          CACHE_TTL_MS
        );
        if (DEV) console.log(`[chat] Cached response for query: ${text.slice(0, 50)}...`);
      } catch (e) {
        if (DEV) console.warn("[chat] Cache set failed:", e);
      }
    } else if (DEV && (!outText || (out1 as any)?.fallback)) {
      console.warn('⚠️ [chat] Skipping cache - outText invalid or fallback');
    }
    
    // Inject prices into card mentions (cache-first, Scryfall fallback)
    try {
      const { extractCardNames } = await import("@/lib/ai/price-injection");
      const cardNames = extractCardNames(outText);
      if (cardNames.length > 0) {
        const { getCachedPrices } = await import("@/lib/ai/price-utils");
        const normalizeName = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’'`]/g, "'").replace(/\s+/g, " ").trim();
        const prices = await getCachedPrices(cardNames.map(normalizeName));
        
        // Inject prices into response
        for (const cardName of cardNames) {
          const normalizedName = normalizeName(cardName);
          const priceData = prices[normalizedName];
          const price = priceData?.usd;
          
          if (price && price > 0) {
            const priceStr = price >= 100 ? `$${Math.round(price)}+` : `$${price.toFixed(2)}`;
            const escapedName = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern1 = new RegExp(`\\*\\*${escapedName}\\*\\*(?!\\s*\\()`, 'g');
            const pattern2 = new RegExp(`\\[\\[${escapedName}\\]\\](?!\\s*\\()`, 'g');
            outText = outText.replace(pattern1, `**${cardName}** (${priceStr})`);
            outText = outText.replace(pattern2, `[[${cardName}]] (${priceStr})`);
          }
        }
      }
    } catch (error) {
      // Silently fail - price injection is nice-to-have
      console.warn('[chat] Price injection failed:', error);
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

    // AI usage + cost tracking (single row via recordAiUsage; planner_* when two-stage)
    try {
      const u = (out1 as any)?.usage || {};
      const inputTokens = Number(u.prompt_tokens ?? u.input_tokens ?? 0);
      const outputTokens = Number(u.completion_tokens ?? u.output_tokens ?? 0);
      let it = isFinite(inputTokens) ? inputTokens : 0;
      let ot = isFinite(outputTokens) ? outputTokens : 0;
      if (!it && !ot) {
        const approx = Math.ceil((text?.length || 0) / 4);
        it = approx; ot = Math.ceil((outText?.length || 0) / 4);
      }
      const { costUSD } = await import("@/lib/ai/pricing");
      const actualModel = out1?.actualModel ?? getModelForTier({ isGuest, userId: userId ?? null, isPro: isPro ?? false }).model;
      const cost = costUSD(actualModel, it, ot);
      const { getDynamicTokenCeiling } = await import('@/lib/ai/chat-generation-config');
      const maxTokensConfig = getDynamicTokenCeiling({ isComplex: isComplexAnalysis, deckCardCount }, false);
      const { recordAiUsage } = await import("@/lib/ai/log-usage");
      await recordAiUsage({
        user_id: userId ?? null,
        thread_id: tid ?? null,
        model: actualModel,
        input_tokens: it,
        output_tokens: ot,
        cost_usd: cost,
        route: "chat",
        request_kind: layer0Mode ?? undefined,
        layer0_mode: layer0Mode ?? undefined,
        layer0_reason: layer0Reason ?? undefined,
        prompt_path: promptResult.promptPath ?? undefined,
        format_key: promptResult.formatKey ?? undefined,
        model_tier: chatTierRes.tier,
        prompt_preview: typeof text === "string" ? text.slice(0, 1000) : null,
        response_preview: typeof outText === "string" ? outText.slice(0, 1000) : null,
        context_source: contextSource !== "raw_fallback" ? contextSource : undefined,
        summary_tokens_estimate: summaryTokensEstimate ?? undefined,
        deck_hash: deckHashForLog ?? undefined,
        has_deck_context: !!(deckIdToUse || pastedDecklistContext),
        deck_card_count: v2Summary?.card_count ?? (entries.length || undefined),
        used_v2_summary: !!v2Summary,
        used_two_stage: !!plannerUsage,
        planner_model: plannerUsage?.model ?? undefined,
        planner_tokens_in: plannerUsage?.inputTokens ?? undefined,
        planner_tokens_out: plannerUsage?.outputTokens ?? undefined,
        planner_cost_usd: plannerUsage?.cost_usd ?? undefined,
        stop_sequences_enabled: true,
        max_tokens_config: maxTokensConfig,
        deck_id: deckIdToUse ?? undefined,
        latency_ms: Date.now() - stage1T,
        user_tier: chatTierRes.tier,
        is_guest: isGuest,
        cache_hit: false,
        cache_kind: undefined,
        prompt_tier: selectedTier,
        system_prompt_token_estimate: estimateSystemPromptTokens(sys),
      });
    } catch {}

    // Server analytics (no-op if key missing)
    try {
      const { captureServer } = await import("@/lib/server/analytics");
      if (created) await captureServer("thread_created", { thread_id: tid, user_id: userId });
      await captureServer("chat_sent", {
        provider,
        ms: Date.now() - t0,
        thread_id: tid,
        user_id: userId,
        persona: persona_id,
        prompt_version: promptVersionId || null,
        prompt_path: promptResult.promptPath,
        format_key: promptResult.formatKey ?? null,
        user_message: text ? text.slice(0, 200) : null,
        assistant_message: outText ? outText.slice(0, 200) : null,
        format: typeof prefs?.format === 'string' ? prefs.format : null,
        commander_name: inferredContext?.commander || null
      });
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

