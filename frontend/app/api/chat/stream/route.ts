import { NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { ChatPostSchema } from "@/lib/validate";
import type { SfCard } from "@/lib/deck/inference";
import { MAX_STREAM_SECONDS, MAX_TOKENS_STREAM, STREAM_HEARTBEAT_MS } from "@/lib/config/streaming";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { getModelForTier } from "@/lib/ai/model-by-tier";
import { isChatCompletionsModel } from "@/lib/ai/modelCapabilities";
import { buildSystemPromptForRequest, generatePromptRequestId } from "@/lib/ai/prompt-path";
import { FREE_DAILY_MESSAGE_LIMIT, GUEST_MESSAGE_LIMIT, PRO_DAILY_MESSAGE_LIMIT } from "@/lib/limits";

export const runtime = "nodejs";

const CHAT_HARDCODED_DEFAULT = "You are ManaTap AI, a concise, budget-aware Magic: The Gathering assistant. When mentioning card names, wrap them in [[Double Brackets]]. Put a space after colons. Do NOT suggest cards already in the decklist.";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEV = process.env.NODE_ENV !== "production";

// Add GET method for health check
export async function GET(req: NextRequest) {
  return new Response(JSON.stringify({ 
    status: "ok", 
    endpoint: "/api/chat/stream",
    method: "GET",
    timestamp: new Date().toISOString()
  }), {
    headers: { "Content-Type": "application/json" }
  });
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let status = 200;
  let userId: string | null = null;
  let isGuest = false;
  let isPro = false;

  try {
    const supabase = await getServerSupabase();
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
    let guestToken: string | null = null;
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      isGuest = true;
    } else {
      userId = user.id;
      try {
        const { checkProStatus } = await import('@/lib/server-pro-check');
        isPro = await checkProStatus(userId);
      } catch {}
    }

    // Accept { text } and legacy { prompt }
    const raw = await req.json().catch(() => ({}));
    const inputText = typeof raw?.prompt === "string" ? raw.prompt : raw?.text;
    
    const normalized = { text: inputText, threadId: raw?.threadId };
    const parse = ChatPostSchema.safeParse(normalized);
    
    if (!parse.success) { 
      status = 400;
      return new Response(JSON.stringify({ 
        fallback: true, 
        reason: "validation_failed",
        error: parse.error.issues[0].message 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const { text, threadId } = parse.data;
    
    // Check if OpenAI API key exists
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ 
        fallback: true,
        reason: "missing_api_key",
        message: "OpenAI API key not configured" 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Maintenance mode (defense-in-depth; middleware also blocks)
    const { checkMaintenance } = await import('@/lib/maintenance-check');
    const maint = await checkMaintenance();
    if (maint.enabled) {
      return new Response(JSON.stringify({
        fallback: true,
        reason: "maintenance",
        message: maint.message,
      }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Guest user limit checking (server-side enforcement)
    if (isGuest) {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      guestToken = cookieStore.get('guest_session_token')?.value || null;
      const userAgent = req.headers.get('user-agent') || 'unknown';
      
      if (!guestToken) {
        return new Response(JSON.stringify({
          fallback: true,
          reason: "guest_token_missing",
          message: "Please sign in to continue chatting. Guest access requires a session token.",
          guestLimitReached: true
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Verify token
      const { verifyGuestToken } = await import('@/lib/guest-tracking');
      const tokenData = await verifyGuestToken(guestToken);
      
      if (!tokenData) {
        return new Response(JSON.stringify({
          fallback: true,
          reason: "guest_token_invalid",
          message: "Please sign in to continue chatting. Invalid or expired guest session.",
          guestLimitReached: true
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Check limit server-side
      const { checkGuestMessageLimit } = await import('@/lib/api/guest-limit-check');
      const guestCheck = await checkGuestMessageLimit(supabase, guestToken, ip, userAgent);
      
      if (!guestCheck.allowed) {
        return new Response(JSON.stringify({
          fallback: true,
          reason: "guest_limit_exceeded",
          message: `Please sign in to continue chatting. You've reached the ${GUEST_MESSAGE_LIMIT} message limit for guest users.`,
          guestLimitReached: true
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    let anonId: string | null = null;
    if (userId) {
      const { hashString: hs } = await import('@/lib/guest-tracking');
      anonId = await hs(userId);
    } else if (guestToken) {
      const { hashGuestToken } = await import('@/lib/guest-tracking');
      anonId = await hashGuestToken(guestToken);
    }

    // Rate limiting for authenticated users
    if (!isGuest && userId) {
      // Durable rate limiting (database-backed)
      const { checkDurableRateLimit } = await import('@/lib/api/durable-rate-limit');
      const { hashString } = await import('@/lib/guest-tracking');
      const userKeyHash = `user:${await hashString(userId)}`;
      
      const dailyLimit = isPro ? PRO_DAILY_MESSAGE_LIMIT : FREE_DAILY_MESSAGE_LIMIT;
      const durableLimit = await checkDurableRateLimit(supabase, userKeyHash, '/api/chat/stream', dailyLimit, 1);
      
      if (!durableLimit.allowed) {
        return new Response(JSON.stringify({ 
          ok: false,
          code: "RATE_LIMIT_DAILY",
          fallback: true,
          reason: "durable_rate_limited",
          message: `You've reached your daily limit of ${dailyLimit} messages. ${isPro ? 'Contact support if you need higher limits.' : 'Upgrade to Pro for more!'}`,
          resetAt: durableLimit.resetAt
        }), {
          status: 429,
          headers: { "Content-Type": "application/json" }
        });
      }

      // In-memory rate limiting (short-term burst protection)
      const rl = await checkRateLimit(supabase as any, userId);
      if (!rl.ok) {
        return new Response(JSON.stringify({ 
          fallback: true,
          reason: "rate_limited",
          message: rl.error || "Rate limited"
        }), {
          status: 429,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    const modelTierRes = getModelForTier({ isGuest, userId, isPro });
    const promptRequestId = generatePromptRequestId();

    // Guardrail: chat/completions only accepts chat-capable models
    let effectiveModel = modelTierRes.model;
    if (!isChatCompletionsModel(effectiveModel)) {
      console.warn(JSON.stringify({
        tag: "model_rejected_chat",
        requestId: promptRequestId,
        route: "/api/chat/stream",
        tier: modelTierRes.tier,
        model: effectiveModel,
        replacement: modelTierRes.fallbackModel,
      }));
      effectiveModel = modelTierRes.fallbackModel;
    }

    // Save user message to database FIRST (if thread exists and user is logged in)
    // This ensures it's in the DB when we fetch messages for RAG
    let tid = threadId ?? null;
    if (tid && !isGuest && userId) {
      try {
        await supabase.from("chat_messages")
          .insert({ thread_id: tid, role: "user", content: text });
      } catch (error) {
        console.warn("[stream] Failed to save user message:", error);
      }
    }

    const prefs = raw?.prefs || raw?.preferences || null;
    const contextDeckId = typeof raw?.context === "object" && raw.context !== null && "deckId" in raw.context ? (raw.context as any).deckId : null;
    let deckIdLinked: string | null = null;
    if (tid && !isGuest) {
      const { data: th } = await supabase.from("chat_threads").select("deck_id").eq("id", tid).maybeSingle();
      deckIdLinked = (th?.deck_id as string) ?? null;
    }
    if (contextDeckId) deckIdLinked = contextDeckId;

    let deckData: { d: any; entries: Array<{ count: number; name: string }>; deckText: string } | null = null;
    if (deckIdLinked) {
      try {
        const { data: d } = await supabase.from("decks").select("title, commander, format").eq("id", deckIdLinked).maybeSingle();
        const { data: allCards } = await supabase.from("deck_cards").select("name, qty").eq("deck_id", deckIdLinked).limit(400);
        let entries: Array<{ count: number; name: string }> = [];
        let deckText = "";
        if (allCards && Array.isArray(allCards) && allCards.length > 0) {
          entries = allCards.map((c: any) => ({ count: c.qty || 1, name: c.name }));
          deckText = entries.map((e: { count: number; name: string }) => `${e.count} ${e.name}`).join("\n");
        }
        deckData = { d, entries, deckText };
      } catch (_) {}
    }

    // formatKey: prefs.format is source of truth; do not override with deck.format when deckId present
    const deckFormat = deckData?.d?.format ? String(deckData.d.format).toLowerCase().replace(/\s+/g, "") : null;
    const formatKey = (typeof prefs?.format === "string" ? prefs.format : null) ?? deckFormat ?? "commander";

    let deckContextForCompose: { deckCards: Array<{ name: string; count?: number }>; commanderName: string | null; colorIdentity: string[] | null; deckId?: string } | null = deckData?.entries?.length
      ? { deckCards: deckData.entries, commanderName: deckData.d?.commander ?? null, colorIdentity: null as string[] | null, deckId: deckIdLinked ?? undefined }
      : null;

    // Homepage chat: pasted decklist — extract commander + entries so MODULE_GRAVEYARD_RECURSION etc. can attach
    if (!deckContextForCompose?.deckCards?.length) {
      try {
        const { isDecklist, extractCommanderFromDecklistText } = await import("@/lib/chat/decklistDetector");
        const { parseDeckText } = await import("@/lib/deck/parseDeckText");
        if (isDecklist(text)) {
          const entries = parseDeckText(text).map((e) => ({ name: e.name, count: e.qty }));
          const commanderName = extractCommanderFromDecklistText(text, text);
          if (entries.length >= 6) {
            deckContextForCompose = { deckCards: entries, commanderName, colorIdentity: null, deckId: undefined };
          }
        }
      } catch (_) {}
    }

    const hasDeckContextForTier = !!(deckContextForCompose?.deckCards?.length);
    const { classifyPromptTier, MICRO_PROMPT, estimateSystemPromptTokens } = await import("@/lib/ai/prompt-tier");
    const tierResult = classifyPromptTier({ text, hasDeckContext: hasDeckContextForTier, deckContextForCompose });
    const selectedTier = tierResult.tier;

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
      if (tid) {
      const { data: msgs } = await supabase.from("chat_messages").select("role, content").eq("thread_id", tid).order("created_at", { ascending: true }).limit(30);
      const threadHist = Array.isArray(msgs) ? msgs : [];
      const { isDecklist } = await import("@/lib/chat/decklistDetector");
      const last2 = threadHist.filter((m: { role: string }) => m.role === "user" || m.role === "assistant").slice(-2);
      const redacted = last2.map((m: { role: string; content: string }) => {
        const content = typeof m.content === "string" ? m.content : "";
        const label = m.role === "user" ? "User" : "Assistant";
        const body = isDecklist(content) ? "(decklist provided; summarized)" : content;
        return `${label}: ${body}`;
      });
      if (redacted.length > 0) {
        sys += "\n\nRecent conversation (last 2 turns):\n" + redacted.join("\n");
      }
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

    let promptLogged = false;
    if (!promptLogged) {
      promptLogged = true;
      console.log(JSON.stringify({
        tag: "prompt",
        requestId: promptRequestId,
        promptPath: promptResult.promptPath,
        promptTier: selectedTier,
        systemPromptTokenEstimate: estimateSystemPromptTokens(sys),
        kind: "chat",
        formatKey: promptResult.formatKey ?? formatKey,
        modulesAttachedCount: promptResult.modulesAttached?.length ?? 0,
        promptVersionId: promptResult.promptVersionId ?? null,
        tier: modelTierRes.tier,
        model: effectiveModel,
        route: "/api/chat/stream",
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
            tier: modelTierRes.tier,
            model: effectiveModel,
            route: "/api/chat/stream",
            request_id: promptRequestId,
          });
        }
      } catch (_) {}
    }

    if (selectedTier === "full") {
    // User preferences: Commander must never use "Colors=any" (enforce color identity)
    if (prefs && (prefs.format || prefs.budget || (Array.isArray(prefs.colors) && prefs.colors.length))) {
      const plan = typeof prefs.budget === "string" ? prefs.budget : (typeof prefs.plan === "string" ? prefs.plan : undefined);
      let colors: string;
      if (formatKey === "commander") {
        const cols = Array.isArray(prefs.colors) ? prefs.colors : [];
        colors = cols?.length
          ? `${cols.join(",")} (fixed; do NOT violate)`
          : "commander color identity (infer from commander; do NOT treat as any)";
      } else {
        colors = "not applicable";
      }
      sys += `\n\nUser preferences: Format=${formatKey}, Value=${plan || "optimized"}, Colors=${colors}. Assume these without asking. Do NOT say "Format unclear" — use the format above.`;
    }
    }

    // User level: tailor language, tone, and depth (beginner/intermediate/pro)
    const { getUserLevelInstruction } = await import("@/lib/ai/user-level-instructions");
    sys += getUserLevelInstruction(prefs?.userLevel);

    // Runtime AI config (env overrides when explicitly off)
    const streamRuntimeConfig = await (await import("@/lib/ai/runtime-config")).getRuntimeAIConfig(supabase);
    // LLM v2 context (Phase A). Kill-switch: LLM_V2_CONTEXT=off or runtime forces raw path.
    let v2Summary: import("@/lib/deck/deck-context-summary").DeckContextSummary | null = null;
    let streamContextSource: "linked_db" | "paste_ttl" | "raw_fallback" = "raw_fallback";
    let streamSummaryTokensEstimate: number | null = null;
    let streamDeckHashForLog: string | null = null;
    let streamThreadHistory: Array<{ role: string; content: string }> = [];
    const streamV2BuildStart = Date.now();
    if (streamRuntimeConfig.flags.llm_v2_context !== false) {
      try {
        const {
          deckHash,
          buildDeckContextSummary,
          getPasteSummary,
          setPasteSummary,
          estimateSummaryTokens,
        } = await import("@/lib/deck/deck-context-summary");
        if (deckData?.deckText?.trim()) {
          const deckText = deckData.deckText;
          const hash = deckHash(deckText);
          streamDeckHashForLog = hash;
          const admin = (await import("@/app/api/_lib/supa")).getAdmin();
          if (admin) {
            const { data: row } = await admin
              .from("deck_context_summary")
              .select("summary_json")
              .eq("deck_id", deckIdLinked!)
              .eq("deck_hash", hash)
              .maybeSingle();
            if (row?.summary_json) {
              v2Summary = row.summary_json as import("@/lib/deck/deck-context-summary").DeckContextSummary;
              streamContextSource = "linked_db";
            } else {
              v2Summary = await buildDeckContextSummary(deckText, {
                format: (deckData.d?.format as "Commander" | "Modern" | "Pioneer") ?? "Commander",
                commander: deckData.d?.commander ?? null,
                colors: Array.isArray(deckData.d?.colors) ? deckData.d.colors : [],
              });
              await admin.from("deck_context_summary").upsert(
                { deck_id: deckIdLinked!, deck_hash: hash, summary_json: v2Summary },
                { onConflict: "deck_id,deck_hash" }
              );
              streamContextSource = "linked_db";
            }
          } else {
            v2Summary = await buildDeckContextSummary(deckText, {
              format: (deckData.d?.format as "Commander" | "Modern" | "Pioneer") ?? "Commander",
              commander: deckData.d?.commander ?? null,
              colors: Array.isArray(deckData.d?.colors) ? deckData.d.colors : [],
            });
            streamContextSource = "raw_fallback";
          }
          streamSummaryTokensEstimate = estimateSummaryTokens(v2Summary);
        } else if (tid) {
          const { data: msgs } = await supabase.from("chat_messages").select("role, content").eq("thread_id", tid).order("created_at", { ascending: true }).limit(30);
          streamThreadHistory = Array.isArray(msgs) ? msgs : [];
          const { isDecklist } = await import("@/lib/chat/decklistDetector");
          let pastedDeckTextRaw: string | null = null;
          for (let i = streamThreadHistory.length - 1; i >= 0; i--) {
            const msg = streamThreadHistory[i];
            if (msg.role === "user" && msg.content && isDecklist(msg.content)) {
              pastedDeckTextRaw = msg.content;
              break;
            }
          }
          if (pastedDeckTextRaw) {
            const hash = deckHash(pastedDeckTextRaw);
            streamDeckHashForLog = hash;
            const cached = getPasteSummary(hash);
            if (cached) {
              v2Summary = cached;
              streamContextSource = "paste_ttl";
            } else {
              v2Summary = await buildDeckContextSummary(pastedDeckTextRaw, { format: "Commander" });
              setPasteSummary(hash, v2Summary);
              streamContextSource = "paste_ttl";
            }
            streamSummaryTokensEstimate = estimateSummaryTokens(v2Summary);
          }
        }
        const streamV2BuildMs = Date.now() - streamV2BuildStart;
        if (v2Summary && streamV2BuildMs > 400) {
          console.warn(JSON.stringify({ tag: "slow_summary_build", route: "/api/chat/stream", ms: streamV2BuildMs }));
          v2Summary = null;
          streamContextSource = "raw_fallback";
          streamSummaryTokensEstimate = null;
        }
      } catch (e) {
        console.warn("[stream] v2 context build failed, falling back to raw:", e);
      }
    }

    if (selectedTier === "full" && v2Summary) {
      // For simple queries, shrink card_names: intent-based top-K or trim to 25 (token creep guard)
      const queryLower = (text || '').toLowerCase().trim();
      const looksSimple = /^(what is|what's|show|find|search|cards?|creatures?|artifacts?|enchantments?|is |can |does |will )\b/i.test(queryLower.trim()) ||
        /^(is|can|does|will)\s+\w+\s+(a|an|legal|banned|good|bad)\b/i.test(queryLower.trim());
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
      const last6 = streamThreadHistory.filter((m) => m.role === "user" || m.role === "assistant").slice(-6);
      const redacted = last6.map((m) => {
        const content = typeof m.content === "string" ? m.content : "";
        const label = m.role === "user" ? "User" : "Assistant";
        const body = isDecklist(content) ? "(decklist provided; summarized)" : content;
        return `${label}: ${body}`;
      });
      if (redacted.length > 0) {
        sys += "\n\nRecent conversation (last 6 turns):\n" + redacted.join("\n");
      }
    } else if (selectedTier === "full" && deckData && deckData.deckText.trim()) {
      const d = deckData.d;
      const formatDisplay = deckFormat || formatKey;
      let inferredContext: { format: string; colors: string[]; commander: string | null } = { format: formatDisplay, colors: [], commander: d?.commander ?? null };
      if (deckData.entries.length > 0) {
        try {
          const { inferDeckContext, fetchCard } = await import("@/lib/deck/inference");
          const byName = new Map<string, SfCard>();
          const unique = Array.from(new Set(deckData.entries.map((e: { name: string }) => e.name))).slice(0, 50);
          const looked = await Promise.all(unique.map((name: string) => fetchCard(name)));
          for (const c of looked) {
            if (c) byName.set(c.name.toLowerCase(), c);
          }
          inferredContext = await inferDeckContext(deckData.deckText, text, deckData.entries, formatDisplay, d?.commander ?? null, [], byName);
        } catch (_) {}
      }
      sys += `\n\nDECK CONTEXT (YOU ALREADY KNOW THIS - DO NOT ASK OR ASSUME):\n`;
      sys += `- Format: ${inferredContext.format} (this is the deck's format; do NOT say "Format unclear" or "I'll assume")\n`;
      sys += `- Colors: ${inferredContext.colors.join(", ") || "none"}\n`;
      if (inferredContext.commander) sys += `- Commander: ${inferredContext.commander}\n`;
      sys += `- Deck Title: ${d?.title || "Untitled Deck"}\n`;
      sys += `- Full Decklist:\n${deckData.deckText}\n`;
      sys += `- IMPORTANT: You already have the complete decklist above. Do NOT ask the user to share or provide the decklist. Start directly with analysis or suggestions.\n`;
      if (String(inferredContext.format).toLowerCase() !== "commander") {
        sys += `- Do NOT suggest Commander-only cards (e.g. Sol Ring, Command Tower). Only suggest cards legal in ${inferredContext.format}.\n`;
      }
      sys += `- Do NOT suggest cards already in the decklist above.\n`;
      sys += `- When describing draw vs filtering: card advantage = net gain of cards; Faithless Looting / Careful Study = filtering, not draw.\n`;
    }

    // Few-shot learning (format anchoring): same as non-stream for consistent quality — full tier only
    if (selectedTier === "full" && userId && !isGuest) {
      try {
        const { findSimilarExamples, formatExamplesForPrompt } = await import("@/lib/ai/few-shot-learning");
        const examples = await findSimilarExamples(text, undefined, undefined, 2);
        if (examples.length > 0) {
          sys += formatExamplesForPrompt(examples);
        }
      } catch (err) {
        console.warn("[chat/stream] Few-shot learning failed:", err instanceof Error ? err.message : String(err));
      }
    }

    if (selectedTier === "full" && tid && !v2Summary) {
      try {
        const { data: messages } = await supabase.from("chat_messages").select("role, content").eq("thread_id", tid).order("created_at", { ascending: true }).limit(30);
        if (messages?.length) {
          const { isDecklist } = await import("@/lib/chat/decklistDetector");
          const { analyzeDecklistFromText, generateDeckContext } = await import("@/lib/chat/enhancements");
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (i === messages.length - 1 && msg.content === text && !isDecklist(msg.content)) continue;
            if (msg.role === "user" && msg.content && isDecklist(msg.content)) {
              const decklistContext = generateDeckContext(analyzeDecklistFromText(msg.content), "Pasted Decklist", msg.content);
              if (decklistContext) { sys += "\n\n" + decklistContext; break; }
            }
          }
        }
      } catch (_) {}
    }

    if (selectedTier === "full") {
    sys += `\n\nFormatting: Use "Step 1", "Step 2" (with a space after Step). Put a space after colons. Keep step-by-step analysis concise; lead with actionable recommendations. Do NOT suggest cards that are already in the decklist.`;
    }

    // Budget cap: block new API calls if daily/weekly limit exceeded
    const { allowAIRequest, checkBudgetStatus } = await import('@/lib/server/budgetEnforcement');
    const budgetCheck = await allowAIRequest(supabase);
    if (!budgetCheck.allow) {
      return new Response(JSON.stringify({
        error: { message: budgetCheck.reason ?? 'AI budget limit reached. Try again later.' }
      }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Layer 0: deterministic / mini-only gate (runtime or env LLM_LAYER0=on)
    const streamHasDeckContextForLayer0 = !!v2Summary || !!(deckData?.deckText?.trim());
    let streamLayer0Mode: string | null = null;
    let streamLayer0Reason: string | null = null;
    let streamLayer0MiniOnly: { model: string; max_tokens: number } | null = null;
    const streamForceFullRoutes = streamRuntimeConfig.llm_force_full_routes ?? [];
    const streamForceFull = Array.isArray(streamForceFullRoutes) && streamForceFullRoutes.includes("chat_stream");
    if (streamRuntimeConfig.flags.llm_layer0 === true && !streamForceFull) {
      const { layer0Decide } = await import("@/lib/ai/layer0-gate");
      const { getFaqAnswer } = await import("@/lib/ai/static-faq");
      const status = await checkBudgetStatus(supabase);
      const nearBudgetCap = status.daily_usage_pct >= 90;
      const decision = layer0Decide({
        text,
        hasDeckContext: streamHasDeckContextForLayer0,
        deckCardCount: v2Summary?.card_count ?? null,
        isAuthenticated: !!userId,
        route: "chat_stream",
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
        if (tid) {
          await supabase.from("chat_messages").insert({ thread_id: tid, role: "assistant", content: responseText });
        }
        const { recordAiUsage } = await import("@/lib/ai/log-usage");
        await recordAiUsage({
          user_id: userId ?? null,
          anon_id: anonId ?? null,
          thread_id: tid || null,
          model: "none",
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: 0,
          route: "chat_stream",
          request_kind: "NO_LLM",
          context_source: streamContextSource,
          layer0_mode: "NO_LLM",
          layer0_reason: decision.reason,
          is_guest: isGuest,
          user_tier: modelTierRes.tier,
        });
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(responseText));
            controller.enqueue(encoder.encode("\n[DONE]"));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
          },
        });
      }
      if (decision.mode === "MINI_ONLY") {
        streamLayer0Mode = "MINI_ONLY";
        streamLayer0Reason = decision.reason;
        streamLayer0MiniOnly = { model: decision.model, max_tokens: decision.max_tokens };
      } else {
        streamLayer0Mode = "FULL_LLM";
        streamLayer0Reason = decision.reason;
      }
    }

    const { hashString, hashGuestToken } = await import('@/lib/guest-tracking');
    const sysPromptHash = await hashString(sys || '');
    const { isPublicCacheEligible } = await import('@/lib/ai/cache-allowlist');
    const streamHasChatHistory = streamThreadHistory.length > 0;
    const publicEligible = isPublicCacheEligible({
      hasDeckContext: !!v2Summary || !!(deckData?.deckText?.trim()),
      hasChatHistory: streamHasChatHistory,
      userMessage: text,
      layer0Handler: streamLayer0Mode === "NO_LLM" ? undefined : streamLayer0Mode ?? undefined,
    });
    const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

    // Phase B: dynamic token ceiling and stop sequences
    const { getDynamicTokenCeiling, CHAT_STOP_SEQUENCES } = await import('@/lib/ai/chat-generation-config');
    const queryLower = (text || '').toLowerCase();
    const isSimpleQuery =
      /^(what is|what's|show|find|search|cards?|creatures?|artifacts?|enchantments?)\b/i.test(queryLower.trim()) ||
      /^(is|can|does|will)\s+\w+\s+(a|an|legal|banned|good|bad)\b/i.test(queryLower.trim());
    const streamHasDeckContext = !!v2Summary || !!(deckData?.deckText?.trim());
    const complexKeywords = [
      /\b(synergy|how.*work|why.*work|explain|analyze|analysis|strategy|archetype|combo|interaction|engine)\b/i,
      /\b(what.*wrong|improve|suggest|recommend|swap|better|upgrade|optimize)\b/i,
      /\b(why|how does|what makes|how would|why would|what.*best|which.*better)\b/i,
    ];
    const complexKeywordCount = complexKeywords.filter((re) => re.test(queryLower)).length;
    const isComplexAnalysis = !isSimpleQuery && (streamHasDeckContext || complexKeywordCount >= 2);
    const streamMinFloor = streamRuntimeConfig.llm_min_tokens_per_route?.["chat_stream"];
    let tokenLimit = Math.min(
      getDynamicTokenCeiling(
        { isComplex: isComplexAnalysis, deckCardCount: v2Summary?.card_count ?? 0, minTokenFloor: streamMinFloor },
        true
      ),
      MAX_TOKENS_STREAM
    );
    if (streamLayer0MiniOnly) {
      effectiveModel = streamLayer0MiniOnly.model;
      tokenLimit = Math.min(streamLayer0MiniOnly.max_tokens, MAX_TOKENS_STREAM);
    }
    
    // Create OpenAI streaming request (model by user tier: guest/free/pro)
    const messages: any[] = [
      { role: "system", content: sys },
      { role: "user", content: text }
    ];
    
    const openAIBody = prepareOpenAIBody({
      model: effectiveModel,
      messages,
      stream: true,
      max_completion_tokens: tokenLimit,
      stop: CHAT_STOP_SEQUENCES,
    } as Record<string, unknown>);
    
    console.log("[stream] OpenAI request body:", JSON.stringify(openAIBody, null, 2));

    // Fetch OpenAI *before* creating the stream so we can return a proper JSON error for 429/quota
    // instead of piping a broken stream (which causes "failed to pipe response" in Sentry).
    let openAIResponse: Response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(openAIBody)
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      console.log(`[stream] OpenAI API error ${openAIResponse.status}:`, errorText);

      const isQuota = openAIResponse.status === 429 || /insufficient_quota|rate_limit/i.test(errorText);
      if (isQuota) {
        status = 503;
        return new Response(JSON.stringify({
          error: { message: "Service temporarily limited. Please try again in a few minutes." }
        }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      }

      const tryFallback = effectiveModel !== modelTierRes.fallbackModel;
      if (tryFallback) {
        const fallbackBody = prepareOpenAIBody({
          model: modelTierRes.fallbackModel,
          messages,
          max_completion_tokens: tokenLimit,
          stream: true,
          stop: CHAT_STOP_SEQUENCES,
        } as Record<string, unknown>);
        const fallbackResponse = await fetch(OPENAI_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify(fallbackBody)
        });
        if (fallbackResponse.ok) {
          openAIResponse = fallbackResponse;
        } else {
          const fallbackError = await fallbackResponse.text();
          console.log(`[stream] Fallback model also failed:`, fallbackError);
          status = 503;
          return new Response(JSON.stringify({
            error: { message: "AI service temporarily unavailable. Please try again in a few minutes." }
          }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
          });
        }
      } else {
        status = 503;
        return new Response(JSON.stringify({
          error: { message: "AI service temporarily unavailable. Please try again in a few minutes." }
        }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Create readable stream that consumes the already-fetched OpenAI response body
    const encoder = new TextEncoder();
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let streamStartTime = Date.now();
    let estimatedTokens = 0;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Set up heartbeat
          heartbeatTimer = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(" "));
            } catch {
              if (heartbeatTimer) clearInterval(heartbeatTimer);
            }
          }, STREAM_HEARTBEAT_MS);

          const reader = openAIResponse.body?.getReader();
          if (!reader) throw new Error("No response stream");

          const decoder = new TextDecoder();
          let buffer = "";
          let fullContent = "";
          let streamDone = false;

          while (!streamDone) {
            const elapsed = Date.now() - streamStartTime;
            if (elapsed > MAX_STREAM_SECONDS * 1000) break;
            if (estimatedTokens > MAX_TOKENS_STREAM) break;

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed === "data: [DONE]") {
                streamDone = true;
                break;
              }
              if (trimmed.startsWith("data: ")) {
                try {
                  const jsonStr = trimmed.slice(6);
                  if (jsonStr === "[DONE]") {
                    streamDone = true;
                    break;
                  }
                  const data = JSON.parse(jsonStr);
                  const delta = data.choices?.[0]?.delta?.content;
                  if (delta) {
                    fullContent += delta;
                    estimatedTokens += Math.ceil(delta.length / 4);
                  }
                } catch (e) {
                  if (DEV) console.warn("[stream] parse error:", e, trimmed);
                }
              }
            }
          }

          let outputText = fullContent.trim();
          const { trimOutroLines } = await import("@/lib/chat/outputCleanupFilter");
          outputText = trimOutroLines(outputText);
          const deckCards = deckContextForCompose?.deckCards ?? [];
          if (deckCards.length > 0 && outputText) {
            try {
              const formatKeyVal = (formatKey === "modern" || formatKey === "pioneer" ? formatKey : "commander") as "commander" | "modern" | "pioneer";
              const { validateRecommendations, REPAIR_SYSTEM_MESSAGE } = await import("@/lib/chat/validateRecommendations");
              let result = await validateRecommendations({
                deckCards: deckCards.map((c) => ({ name: c.name })),
                formatKey: formatKeyVal,
                colorIdentity: deckContextForCompose?.colorIdentity ?? null,
                commanderName: deckContextForCompose?.commanderName ?? null,
                rawText: outputText,
              });
              if (!result.valid && result.issues.length > 0) {
                if (DEV) console.warn("[stream] Recommendation validation issues:", result.issues.map((i) => i.message));
                outputText = result.repairedText;
              }
              // Max 1 retry: re-invoke with repair message when needsRegeneration (no streaming on second pass)
              if (result.needsRegeneration) {
                console.log("[stream] regeneration (needsRegeneration) triggered");
                try {
                  const repairBody = prepareOpenAIBody({
                    model: effectiveModel,
                    messages: [
                      { role: "system", content: sys + "\n\n" + REPAIR_SYSTEM_MESSAGE },
                      { role: "user", content: text },
                    ],
                    stream: false,
                    max_completion_tokens: MAX_TOKENS_STREAM,
                    stop: CHAT_STOP_SEQUENCES,
                  } as Record<string, unknown>);
                  const regenRes = await fetch(OPENAI_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                    body: JSON.stringify(repairBody),
                  });
                  if (regenRes.ok) {
                    const regenJson = await regenRes.json();
                    const regenContent = regenJson?.choices?.[0]?.message?.content;
                    if (typeof regenContent === "string" && regenContent.trim()) {
                      outputText = regenContent.trim();
                      result = await validateRecommendations({
                        deckCards: deckCards.map((c) => ({ name: c.name })),
                        formatKey: formatKeyVal,
                        colorIdentity: deckContextForCompose?.colorIdentity ?? null,
                        commanderName: deckContextForCompose?.commanderName ?? null,
                        rawText: outputText,
                        isRegenPass: true,
                      });
                      if (!result.valid && result.issues.length > 0) outputText = result.repairedText;
                    }
                  }
                } catch (regenErr) {
                  if (DEV) console.warn("[stream] regeneration request failed:", regenErr);
                }
              }
              const { applyOutputCleanupFilter, stripIncompleteSynergyChains, stripIncompleteTruncation, applyBracketEnforcement } = await import("@/lib/chat/outputCleanupFilter");
              outputText = stripIncompleteSynergyChains(outputText);
              outputText = stripIncompleteTruncation(outputText);
              outputText = applyOutputCleanupFilter(outputText);
              outputText = applyBracketEnforcement(outputText);
              if (DEV) {
                const { humanSanityCheck } = await import("@/lib/chat/humanSanityCheck");
                const flags = humanSanityCheck(outputText);
                if (!flags.feelsHuman || flags.instructionalPhrases.length > 0)
                  console.warn("[stream] humanSanityCheck flags:", flags);
              }
            } catch (e) {
              if (DEV) console.warn("[stream] validateRecommendations/cleanup error:", e);
            }
          }

          try {
            const { recordAiUsage } = await import("@/lib/ai/log-usage");
            const inputLen = (sys?.length || 0) + (text?.length || 0);
            const it = Math.ceil(inputLen / 4);
            const ot = Math.ceil((outputText?.length || 0) / 4);
            const { costUSD } = await import("@/lib/ai/pricing");
            const cost = costUSD(effectiveModel, it, ot);
            await recordAiUsage({
              user_id: userId ?? null,
              anon_id: anonId ?? null,
              thread_id: tid || null,
              model: effectiveModel,
              input_tokens: it,
              output_tokens: ot,
              cost_usd: cost,
              route: "chat_stream",
              request_kind: streamLayer0Mode ?? undefined,
              layer0_mode: streamLayer0Mode ?? undefined,
              layer0_reason: streamLayer0Reason ?? undefined,
              prompt_preview: typeof text === "string" ? text.slice(0, 1000) : null,
              response_preview: typeof outputText === "string" ? outputText.slice(0, 1000) : null,
              model_tier: modelTierRes.tier,
              context_source: streamContextSource !== "raw_fallback" ? streamContextSource : undefined,
              summary_tokens_estimate: streamSummaryTokensEstimate ?? undefined,
              deck_hash: streamDeckHashForLog ?? undefined,
              has_deck_context: streamHasDeckContext,
              used_v2_summary: !!v2Summary,
              stop_sequences_enabled: true,
              latency_ms: Date.now() - t0,
              user_tier: modelTierRes.tier,
              is_guest: isGuest,
              deck_id: deckIdLinked ?? undefined,
              cache_hit: false,
              cache_kind: undefined,
              prompt_tier: selectedTier,
              system_prompt_token_estimate: estimateSystemPromptTokens(sys),
            });
          } catch (_) {}

          // Cache-on-complete: write to two-tier cache when stream finishes successfully
          if (outputText && typeof outputText === "string" && outputText.length > 0) {
            try {
              const { hashCacheKey, supabaseCacheSet, normalizeCacheText } = await import("@/lib/utils/supabase-cache");
              let scope: string;
              if (userId) scope = `user:${userId}`;
              else if (guestToken) scope = `guest:${await hashGuestToken(guestToken)}`;
              else {
                try {
                  const { getOrCreateAnonSessionId } = await import("@/lib/guest-tracking");
                  scope = `anon:${await hashString(await getOrCreateAnonSessionId())}`;
                } catch {
                  scope = `ip:${await hashString(ip)}`;
                }
              }
              const payload = publicEligible
                ? {
                    cache_version: 1,
                    model: effectiveModel,
                    sysPromptHash,
                    intent: "public",
                    normalized_user_text: normalizeCacheText(text, true),
                    deck_context_included: false,
                    deck_hash: null as string | null,
                    tier: modelTierRes.tier,
                    locale: null as string | null,
                  }
                : {
                    cache_version: 1,
                    model: effectiveModel,
                    sysPromptHash,
                    intent: "private",
                    normalized_user_text: normalizeCacheText(text, false),
                    deck_context_included: streamHasDeckContext,
                    deck_hash: streamDeckHashForLog ?? null,
                    tier: modelTierRes.tier,
                    locale: null as string | null,
                    scope,
                  };
              const key = await hashCacheKey(payload);
              await supabaseCacheSet(supabase, publicEligible ? "ai_public_cache" : "ai_private_cache", key, { text: outputText, usage: {}, fallback: false }, CACHE_TTL_MS);
              if (DEV) console.log(`[stream] Cached response for query: ${text.slice(0, 50)}...`);
            } catch (e) {
              if (DEV) console.warn("[stream] Cache set failed:", e);
            }
          }

          const CHUNK_SIZE = 120;
          for (let i = 0; i < outputText.length; i += CHUNK_SIZE) {
            controller.enqueue(encoder.encode(outputText.slice(i, i + CHUNK_SIZE)));
          }
          controller.enqueue(encoder.encode("\n[DONE]"));
          controller.close();
          
        } catch (error) {
          if (DEV) console.error("[stream] error:", error);
          controller.error(error);
        } finally {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          if (openAIResponse?.body) {
            try {
              await openAIResponse.body.cancel();
            } catch {}
          }
        }
      },
      
      cancel() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Model-Tier": modelTierRes.tier,
      },
    });

  } catch (e: any) {
    status = 500;
    console.error("[stream] Unhandled error:", e);
    return new Response(JSON.stringify({ 
      fallback: true,
      reason: "server_error", 
      message: e.message || "Internal server error"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  } finally {
    const ms = Date.now() - t0;
    console.log(JSON.stringify({ 
      method: "POST", 
      path: "/api/chat/stream", 
      status, 
      ms, 
      userId: isGuest ? "guest" : userId 
    }));
  }
}

// Rate limiting function (copied from main chat route)
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
