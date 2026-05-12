import { NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { ChatPostSchema } from "@/lib/validate";
import type { SfCard } from "@/lib/deck/inference";
import { MAX_STREAM_SECONDS, MAX_TOKENS_STREAM, MAX_TOKENS_DECK_ANALYSIS, STREAM_HEARTBEAT_MS } from "@/lib/config/streaming";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { getModelForTier } from "@/lib/ai/model-by-tier";
import { isChatCompletionsModel } from "@/lib/ai/modelCapabilities";
import { buildSystemPromptForRequest, generatePromptRequestId } from "@/lib/ai/prompt-path";
import { FREE_DAILY_MESSAGE_LIMIT, GUEST_MESSAGE_LIMIT, PRO_DAILY_MESSAGE_LIMIT } from "@/lib/limits";
import { createEmptyAdminPromptPreview, type AdminPromptPreviewPayload } from "@/lib/ai/admin-prompt-preview-types";
import { sanitizeMobileChatSource } from "@/lib/analytics/mobile-chat-source";
import {
  buildDeckTextFromDbRows,
  chatAnalyzeFormat,
  chatFormatForLegality,
  chatFormatSupportInstruction,
  chatResolvedFormatUsesCommanderLayers,
  formatKeyForChatPromptLayers,
  resolveChatFormat,
} from "@/lib/chat/resolve-chat-format";
import {
  buildDirectChatToolAnswer,
  buildDirectDeckContextAnswer,
  buildToolResultsPrompt,
  encodeChatMetadata,
  persistAssistantMessage,
  runChatToolPlanner,
  shouldSkipRecommendationCleanupForChatTurn,
  summarizeToolResults,
  type ChatToolResult,
  type ChatTurnMetadata,
} from "@/lib/chat/orchestrator";
import { maybeCreateDeckChangeProposal } from "@/lib/chat/deck-actions";
import {
  buildDeckIntelligencePacket,
  formatDeckIntelligencePacketForPrompt,
} from "@/lib/ai/intelligence/packet";
import { buildIntelligenceToolResults } from "@/lib/ai/intelligence/tool-registry";

export const runtime = "nodejs";

const CHAT_HARDCODED_DEFAULT = "You are ManaTap AI, a concise, budget-aware Magic: The Gathering assistant. When mentioning card names, wrap them in [[Double Brackets]]. Put a space after colons. Do NOT suggest cards already in the decklist.";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEV = process.env.NODE_ENV !== "production";
const DEBUG_CHAT_STREAM = process.env.DEBUG_CHAT_STREAM === "1";
function streamDebug(tag: string, data: Record<string, unknown>) {
  if (DEBUG_CHAT_STREAM) console.log(JSON.stringify({ tag: `[STREAM_DEBUG]${tag}`, ...data, ts: Date.now() }));
}

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
    // 🔒 Auth precedence (MUST NOT change):
    // 1) cookie user (website)
    // 2) else Bearer user (mobile)
    // 3) else guest via token (header X-Guest-Session-Token or cookie)
    // 4) else guest via IP fallback (mobile without token)
    let supabase = await getServerSupabase();
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
    let guestToken: string | null = null;
    let { data: { user } } = await supabase.auth.getUser();

    // Mobile app: support Authorization: Bearer when cookies have no session.
    // IMPORTANT: Only attempt Bearer auth if cookie auth did not yield a user (precedence rule).
    if (!user) {
      const authHeader = req.headers.get('Authorization');
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import('@/lib/server-supabase');
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser(bearerToken);
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }

    if (!user) {
      isGuest = true;
    } else {
      userId = user.id;
      try {
        const { checkProStatus } = await import('@/lib/server-pro-check');
        isPro = await checkProStatus(userId);
      } catch {}
    }

    const wantPromptPreview =
      req.headers.get("x-admin-prompt-preview") === "1" &&
      !!user &&
      (await import("@/lib/admin-check")).isAdmin(user);
    let adminPv: AdminPromptPreviewPayload | null = wantPromptPreview ? createEmptyAdminPromptPreview() : null;

    // Accept { text } and legacy { prompt }
    const raw = await req.json().catch(() => ({}));
    const clientEntrySource = sanitizeMobileChatSource(raw);
    const inputText = typeof raw?.prompt === "string" ? raw.prompt : raw?.text;
    
    const normalized = { text: inputText, threadId: raw?.threadId, messages: raw?.messages };
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
    
    const { text, threadId, messages: clientMessages } = parse.data;
    const sourcePage = (typeof raw?.sourcePage === "string" ? raw.sourcePage : raw?.source_page)?.trim() || null;
    const { resolveAiUsageSourceForRequest } = await import("@/lib/ai/manatap-client-origin");
    const streamAiUsageSource = resolveAiUsageSourceForRequest(req, raw, null);
    const clientConversation = Array.isArray(clientMessages) ? clientMessages : [];
    
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
    // Supports: cookie token, X-Guest-Session-Token header, or IP fallback for mobile
    if (isGuest) {
      const { getGuestToken } = await import('@/lib/api/get-guest-token');
      const { guestToken: token } = await getGuestToken(req);
      guestToken = token;
      const userAgent = req.headers.get('user-agent') || 'unknown';

      if (guestToken) {
        // Website uses HMAC-signed tokens; the mobile app sends a persisted UUID in this header
        // (see Manatap-APP `getGuestToken`). `verifyGuestToken` only accepts signed payloads — do
        // **not** reject unsigned tokens here, or every mobile guest hits a false "limit" (invalid
        // token is surfaced as `guestLimitReached` in the client). Limits use `guest_sessions` via
        // `checkGuestMessageLimit` (hash of the raw token string).
        const { checkGuestMessageLimit } = await import('@/lib/api/guest-limit-check');
        const guestCheck = await checkGuestMessageLimit(supabase, guestToken, ip, userAgent);
        if (!guestCheck.allowed) {
          return new Response(JSON.stringify({
            fallback: true, reason: "guest_limit_exceeded",
            message: "Guest limit reached. Sign in to continue.",
            code: "RATE_LIMIT_DAILY", tier: "guest", requiresAuth: true, resetAt: null,
            guestLimitReached: true
          }), { status: 429, headers: { "Content-Type": "application/json" } });
        }
      } else {
        // IP fallback for mobile guests (no cookie/header)
        const { checkDurableRateLimit } = await import('@/lib/api/durable-rate-limit');
        const { hashString } = await import('@/lib/guest-tracking');
        const ipKeyHash = `ip:${await hashString(ip)}`;
        const durableLimit = await checkDurableRateLimit(supabase, ipKeyHash, '/api/chat', GUEST_MESSAGE_LIMIT, 1);
        if (!durableLimit.allowed) {
          return new Response(JSON.stringify({
            fallback: true, reason: "guest_limit_exceeded",
            message: "Guest limit reached. Sign in to continue.",
            code: "RATE_LIMIT_DAILY", tier: "guest", requiresAuth: true, resetAt: durableLimit.resetAt ?? null,
            guestLimitReached: true
          }), { status: 429, headers: { "Content-Type": "application/json" } });
        }
        guestToken = null;
      }
    }

    let anonId: string | null = null;
    if (userId) {
      const { hashString: hs } = await import('@/lib/guest-tracking');
      anonId = await hs(userId);
    } else if (guestToken) {
      const { hashGuestToken } = await import('@/lib/guest-tracking');
      anonId = await hashGuestToken(guestToken);
    } else if (isGuest) {
      const { hashString: hs } = await import('@/lib/guest-tracking');
      anonId = await hs(`chat:ip:${ip}`);
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

    let modelTierRes = getModelForTier({ isGuest, userId, isPro });
    const ft = (raw?.context as { forceTier?: string } | undefined)?.forceTier;
    const forceTierFromContext = typeof ft === "string" && (ft === "guest" || ft === "free" || ft === "pro") ? ft : null;
    if (forceTierFromContext && sourcePage?.includes("Admin Chat Test")) {
      modelTierRes = getModelForTier({
        isGuest: forceTierFromContext === "guest",
        userId: forceTierFromContext === "guest" ? null : "admin-override",
        isPro: forceTierFromContext === "pro",
      });
    }
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
    let threadCommander: string | null = null;
    let threadDecklistText: string | null = null;
    let threadDecklistHash: string | null = null;
    if (tid && !isGuest) {
      const { data: th } = await supabase.from("chat_threads")
        .select("deck_id, commander, decklist_text, commander_status, deck_source, decklist_hash, deck_context_updated_at, deck_parse_meta")
        .eq("id", tid).maybeSingle();
      deckIdLinked = (th?.deck_id as string) ?? null;
      threadCommander = (th?.commander as string) ?? null;
      threadDecklistText = (th?.decklist_text as string) ?? null;
      threadDecklistHash = (th?.decklist_hash as string) ?? null;
    }
    if (contextDeckId) deckIdLinked = contextDeckId;

    let deckData: { d: any; entries: Array<{ count: number; name: string }>; deckText: string } | null = null;
    /** Populated from linked `deck_cards` rows (zone-aware); null if not linked or no rows. */
    let linkedDeckCardCounts: { deck_card_count: number; mainboard_card_count: number; sideboard_card_count: number } | null = null;
    if (deckIdLinked) {
      try {
        const { data: d } = await supabase.from("decks").select("title, commander, format").eq("id", deckIdLinked).maybeSingle();
        const { data: allCards } = await supabase.from("deck_cards").select("name, qty, zone").eq("deck_id", deckIdLinked).limit(400);
        let entries: Array<{ count: number; name: string }> = [];
        let deckText = "";
        if (allCards && Array.isArray(allCards) && allCards.length > 0) {
          entries = allCards.map((c: any) => ({ count: c.qty || 1, name: c.name }));
          deckText = buildDeckTextFromDbRows(
            allCards.map((c: any) => ({ name: String(c.name || "").trim(), qty: c.qty, zone: c.zone }))
          );
          let mainboardQty = 0;
          let sideboardQty = 0;
          for (const c of allCards as { qty?: number | null; zone?: string | null }[]) {
            const qty = Math.max(1, Math.floor(Number(c.qty) || 0));
            if (String(c.zone || "mainboard").toLowerCase() === "sideboard") sideboardQty += qty;
            else mainboardQty += qty;
          }
          linkedDeckCardCounts = {
            deck_card_count: mainboardQty + sideboardQty,
            mainboard_card_count: mainboardQty,
            sideboard_card_count: sideboardQty,
          };
        }
        deckData = { d, entries, deckText };
      } catch (_) {}
    }

    const prefsFormatStr = typeof prefs?.format === "string" ? prefs.format : null;
    const ctxFmt =
      typeof raw?.context === "object" && raw?.context !== null && "format" in (raw.context as object)
        ? (raw.context as { format?: string }).format
        : undefined;

    const chatFmtResolved = resolveChatFormat({
      prefsFormat: prefsFormatStr,
      contextFormat: ctxFmt,
      deckFormat: deckData?.d?.format,
    });
    const commanderLayersOn = chatResolvedFormatUsesCommanderLayers(chatFmtResolved);
    const formatKey = formatKeyForChatPromptLayers(chatFmtResolved);

    streamDebug("chat_format_resolution", {
      raw_request: chatFmtResolved.rawRequest,
      raw_deck: chatFmtResolved.rawDeck,
      normalized: chatFmtResolved.canonical,
      format_source: chatFmtResolved.source,
      prompt_format_key: formatKey,
    });

    const deckFormatRaw = typeof deckData?.d?.format === "string" ? deckData.d.format.trim() : null;
    const deckFormat = deckFormatRaw ? String(deckFormatRaw).toLowerCase().replace(/\s+/g, "") : null;

    // Phase 5: ActiveDeckContext as single source of truth
    let streamThreadHistoryEarly: Array<{ role: string; content?: string }> = [];
    if (tid) {
      const { data: msgs } = await supabase.from("chat_messages").select("role, content").eq("thread_id", tid).order("created_at", { ascending: true }).limit(30);
      streamThreadHistoryEarly = (Array.isArray(msgs) ? msgs : []) as Array<{ role: string; content?: string }>;
    }
    const { resolveActiveDeckContext } = await import("@/lib/chat/active-deck-context");
    const { detectRulesLegalityIntent, extractCardNamesFromMessage } = await import("@/lib/deck/rules-facts");
    const isStandaloneRulesQuestion =
      detectRulesLegalityIntent(text ?? "") &&
      (extractCardNamesFromMessage(text ?? "").length > 0 || /\[\[[^\]]+\]\]/.test(text ?? ""));
    const activeDeckContext = resolveActiveDeckContext({
      tid,
      isGuest,
      userId,
      text,
      context: typeof raw?.context === "object" && raw?.context ? (raw.context as { deckId?: string | null }) : null,
      prefs,
      thread: tid ? { deck_id: deckIdLinked, commander: threadCommander, decklist_text: threadDecklistText, decklist_hash: threadDecklistHash } : null,
      streamThreadHistory: streamThreadHistoryEarly,
      clientConversation,
      isStandaloneRulesQuestion,
      deckData,
      applyCommanderNameGating: commanderLayersOn,
    });
    streamDebug("active_deck_context", {
      hasDeck: activeDeckContext.hasDeck,
      source: activeDeckContext.source,
      commanderName: activeDeckContext.commanderName,
      commanderStatus: activeDeckContext.commanderStatus,
      askReason: activeDeckContext.askReason,
      commanderCandidates: activeDeckContext.commanderCandidates,
      resolutionPath: activeDeckContext.debug.resolutionPath,
    });

    // Build deckContextForCompose from ActiveDeckContext
    let deckContextForCompose: { deckCards: Array<{ name: string; count?: number }>; commanderName: string | null; colorIdentity: string[] | null; deckId?: string } | null = null;
    if (activeDeckContext.source === "linked" && deckData?.entries?.length) {
      deckContextForCompose = { deckCards: deckData.entries, commanderName: deckData.d?.commander ?? null, colorIdentity: null, deckId: deckIdLinked ?? undefined };
    } else if (activeDeckContext.hasDeck && activeDeckContext.decklistText) {
      const { parseDeckText } = await import("@/lib/deck/parseDeckText");
      const entries = parseDeckText(activeDeckContext.decklistText).map((e) => ({ name: e.name, count: e.qty }));
      if (entries.length >= 6) {
        deckContextForCompose = { deckCards: entries, commanderName: activeDeckContext.commanderName, colorIdentity: null, deckId: activeDeckContext.deckId ?? undefined };
      }
    }

    // Persist thread slot updates when user pastes new deck (Phase 8: hash change clears commander unless preserved)
    if (tid && !isGuest && activeDeckContext.source === "current_paste" && !deckIdLinked && activeDeckContext.decklistText) {
      const preserveCommander = !activeDeckContext.deckReplacedByHashChange || (activeDeckContext.commanderName && threadCommander && activeDeckContext.commanderName.toLowerCase() === threadCommander.toLowerCase());
      try {
        const updates: Record<string, unknown> = {
          decklist_text: activeDeckContext.decklistText,
          deck_source: "pasted",
          decklist_hash: activeDeckContext.decklistHash,
          deck_context_updated_at: new Date().toISOString(),
          deck_parse_meta: {},
          commander: preserveCommander ? threadCommander : null,
          commander_status: preserveCommander ? (threadCommander ? "confirmed" : "inferred") : "missing",
        };
        await supabase.from("chat_threads").update(updates).eq("id", tid);
        threadDecklistText = activeDeckContext.decklistText;
        threadCommander = preserveCommander ? threadCommander : null;
        streamDebug("deck_context_persist", { reason: "paste_update", decklistHash: activeDeckContext.decklistHash, preserveCommander });
      } catch (_) {}
    }

    const hasDeckContextForTier = !!(deckContextForCompose?.deckCards?.length);

    streamDebug("identity", { isGuest, hasTid: !!tid, hasDeckData: !!deckData, hasDeckContextForCompose: hasDeckContextForTier, deckContextCommander: deckContextForCompose?.commanderName ?? null, deckContextCards: deckContextForCompose?.deckCards?.length ?? 0 });
    const { classifyPromptTier, MICRO_PROMPT, estimateSystemPromptTokens } = await import("@/lib/ai/prompt-tier");
    const tierResult = classifyPromptTier({ text, hasDeckContext: hasDeckContextForTier, deckContextForCompose });
    const selectedTier = tierResult.tier;

    const { NO_FILLER_INSTRUCTION } = await import("@/lib/ai/chat-generation-config");
    let promptResult: Awaited<ReturnType<typeof buildSystemPromptForRequest>>;
    let sys: string;
    let promptVersionId: string | null;
    // Commander decision for full tier: computed early so we can use deck_analysis prompt only when actually analyzing
    let streamInjected: "analyze" | "confirm" | "ask_commander" | "none" = "none";
    let streamDecisionReason: string | null = null;
    let streamNormalizedState: import("@/lib/chat/normalize-commander-decision").NormalizedCommanderState | null = null;
    /** Full tier only: whether routing chose analyze after normalization; null for micro/standard. */
    let mayAnalyzeDebug: boolean | null = null;

    if (selectedTier === "micro") {
      sys = MICRO_PROMPT + "\n\n" + NO_FILLER_INSTRUCTION;
      promptVersionId = null;
      promptResult = { systemPrompt: MICRO_PROMPT, promptPath: "composed", formatKey, modulesAttached: [] };
    } else if (selectedTier === "standard") {
      let standardRecentHistoryAppend = "";
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
        standardRecentHistoryAppend = "\n\nRecent conversation (last 2 turns):\n" + redacted.join("\n");
        sys += standardRecentHistoryAppend;
      }
      }
      if (adminPv) adminPv.standard_recent_history_text = standardRecentHistoryAppend || null;
    } else {
      // Full tier: compute commander decision first so we use deck_analysis only when actually analyzing
      const { isAuthoritativeForPrompt } = await import("@/lib/chat/active-deck-context");
      const authForPrompt = isAuthoritativeForPrompt(activeDeckContext);
      const pasteSource = activeDeckContext.source === "current_paste" || activeDeckContext.source === "guest_ephemeral";
      const commanderConfirmedOrCorrected = activeDeckContext.commanderStatus === "confirmed" || activeDeckContext.commanderStatus === "corrected" || activeDeckContext.userJustConfirmedCommander || activeDeckContext.userJustCorrectedCommander;
      const fullDeckCompose = !!(deckContextForCompose?.deckCards?.length);
      const linkedWithDeckCards = activeDeckContext.source === "linked" && fullDeckCompose;
      const threadBackedDeck = activeDeckContext.source === "thread_slot" && fullDeckCompose;
      const supportsDeepDeckAnalysis = chatAnalyzeFormat(chatFmtResolved) !== null;
      let mayAnalyze = false;
      if (supportsDeepDeckAnalysis && activeDeckContext.hasDeck && fullDeckCompose) {
        if (commanderLayersOn) {
          mayAnalyze =
            !!activeDeckContext.commanderName && (pasteSource ? commanderConfirmedOrCorrected : authForPrompt);
        } else {
          mayAnalyze = pasteSource || linkedWithDeckCards || threadBackedDeck || authForPrompt;
        }
      }
      streamInjected = mayAnalyze ? "analyze" : activeDeckContext.askReason === "confirm_inference" ? "confirm" : activeDeckContext.askReason === "need_commander" ? "ask_commander" : "none";
      streamDecisionReason = mayAnalyze ? "commander_confirmed_or_linked" : activeDeckContext.askReason === "confirm_inference" ? "paste_inferred_ask_confirm" : activeDeckContext.askReason === "need_commander" ? "commander_unknown_ask" : null;

      // Invariant layer: normalize so impossible state combinations cannot slip through
      const { normalizeCommanderDecisionState } = await import("@/lib/chat/normalize-commander-decision");
      const normalizedState = normalizeCommanderDecisionState({
        streamInjected,
        streamDecisionReason,
        activeDeckContext,
        hasFullDeckContext: fullDeckCompose,
        analyzeAllowedWithoutNamedCommander: !commanderLayersOn,
      });
      streamInjected = normalizedState.streamInjected;
      streamDecisionReason = normalizedState.streamDecisionReason;
      streamNormalizedState = normalizedState;
      mayAnalyzeDebug = streamInjected === "analyze";

      const hasDeckContextForPrompt = !!deckContextForCompose;
      let fullTierResult: Awaited<ReturnType<typeof buildSystemPromptForRequest>>;
      // ask_commander/confirm: use chat prompt (no deck_analysis). Deterministic extraction + explicit markers should reduce how often we hit this path.
      if (hasDeckContextForPrompt && (streamInjected === "ask_commander" || streamInjected === "confirm")) {
        fullTierResult = await buildSystemPromptForRequest({
          kind: "chat",
          formatKey,
          deckContextForCompose: null,
          supabase,
          hardcodedDefaultPrompt: CHAT_HARDCODED_DEFAULT,
        });
      } else if (hasDeckContextForPrompt && supportsDeepDeckAnalysis) {
        const { getPromptVersion } = await import("@/lib/config/prompts");
        const deckAnalysisVersion = await getPromptVersion("deck_analysis", supabase);
        if (deckAnalysisVersion?.system_prompt) {
          fullTierResult = {
            systemPrompt: deckAnalysisVersion.system_prompt,
            promptPath: "fallback_version",
            promptVersionId: deckAnalysisVersion.id,
            formatKey,
            modulesAttached: [],
          };
        } else {
          fullTierResult = await buildSystemPromptForRequest({
            kind: "deck_analysis",
            formatKey,
            deckContextForCompose,
            supabase,
            hardcodedDefaultPrompt: CHAT_HARDCODED_DEFAULT,
          });
        }
      } else {
        fullTierResult = await buildSystemPromptForRequest({
          kind: "chat",
          formatKey,
          deckContextForCompose,
          supabase,
          hardcodedDefaultPrompt: CHAT_HARDCODED_DEFAULT,
        });
      }
      promptResult = fullTierResult;
      sys = promptResult.systemPrompt + "\n\n" + NO_FILLER_INSTRUCTION;
      promptVersionId = promptResult.promptVersionId ?? null;
    }

    const formatSupportInstruction = selectedTier !== "micro" ? chatFormatSupportInstruction(chatFmtResolved) : null;
    if (formatSupportInstruction) {
      sys += "\n\n" + formatSupportInstruction;
      if (adminPv) adminPv.notes.push(formatSupportInstruction);
    }

    if (adminPv) {
      adminPv.selected_prompt_tier = selectedTier;
      adminPv.stream_injected = selectedTier === "full" ? streamInjected : "none";
      adminPv.model_tier = modelTierRes.tier;
      if (selectedTier === "micro") {
        adminPv.prompt_path = "micro_override";
        adminPv.prompt_layers_used = false;
        adminPv.base_prompt_source_label = "MICRO_PROMPT (lib/ai/prompt-tier)";
        adminPv.base_prompt_text = MICRO_PROMPT + "\n\n" + NO_FILLER_INSTRUCTION;
        adminPv.modules_attached = [];
        adminPv.prompt_version_id = null;
        adminPv.notes.push("Micro tier uses MICRO_PROMPT, not prompt_layers.");
      } else {
        adminPv.prompt_path = promptResult.promptPath;
        adminPv.prompt_layers_used = promptResult.promptPath === "composed";
        adminPv.prompt_version_id = promptResult.promptVersionId ?? null;
        adminPv.modules_attached = [...(promptResult.modulesAttached ?? [])];
        adminPv.base_prompt_source_label =
          promptResult.promptPath === "composed"
            ? "prompt_layers: BASE_UNIVERSAL_ENFORCEMENT + FORMAT_* (+ MODULE_* when deck context present)"
            : promptResult.promptPath === "fallback_version"
              ? `prompt_versions (${promptResult.promptVersionId ?? "?"})`
              : "hardcoded CHAT_HARDCODED_DEFAULT";
        adminPv.base_prompt_text = promptResult.systemPrompt + "\n\n" + NO_FILLER_INSTRUCTION;
        if (
          selectedTier === "full" &&
          promptResult.promptPath === "fallback_version" &&
          (promptResult.modulesAttached?.length ?? 0) === 0
        ) {
          adminPv.notes.push(
            "When analyzing a linked deck, fallback_version may be the deck_analysis row from prompt_versions (see prompt_version_id), not the chat prompt.",
          );
        }
      }
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

    let userPrefsBlock = "";
    if (selectedTier === "full") {
    // User preferences: Commander must never use "Colors=any" (enforce color identity)
    if (prefs && (prefs.format || prefs.budget || (Array.isArray(prefs.colors) && prefs.colors.length))) {
      const plan = typeof prefs.budget === "string" ? prefs.budget : (typeof prefs.plan === "string" ? prefs.plan : undefined);
      let colors: string;
      if (commanderLayersOn) {
        const cols = Array.isArray(prefs.colors) ? prefs.colors : [];
        colors = cols?.length
          ? `${cols.join(",")} (fixed; do NOT violate)`
          : "commander color identity (infer from commander; do NOT treat as any)";
      } else {
        colors = "not applicable";
      }
      const formatForPrefs = chatFmtResolved.supportEntry?.label ?? chatFmtResolved.canonical ?? formatKey;
      userPrefsBlock = `\n\nUser preferences: Format=${formatForPrefs}, Value=${plan || "optimized"}, Colors=${colors}. Assume these without asking. Do NOT say "Format unclear" — use the format above.`;
      sys += userPrefsBlock;
    }
    }
    if (adminPv) adminPv.user_prefs_text = userPrefsBlock || null;

    // User level: tailor language, tone, and depth (beginner/intermediate/pro)
    const { getUserLevelInstruction } = await import("@/lib/ai/user-level-instructions");
    const userLevelBlock = getUserLevelInstruction(prefs?.userLevel);
    sys += userLevelBlock;
    if (adminPv) adminPv.user_level_text = userLevelBlock || null;

    // Tier overlay (guest/free/pro) — after user level, before v2/deck context
    let tierOverlayCaptured: string | null = null;
    if (selectedTier !== "micro") {
      try {
        const { getTierOverlay, getTierOverlayResolved } = await import("@/lib/ai/tier-overlays");
        const admin = (await import("@/app/api/_lib/supa")).getAdmin();
        const overlay = admin ? await getTierOverlayResolved(admin, modelTierRes.tier) : getTierOverlay(modelTierRes.tier);
        if (overlay) {
          tierOverlayCaptured = overlay;
          sys += "\n\n" + overlay;
          streamDebug("tier_overlay", { tier: modelTierRes.tier, applied: true });
        } else {
          streamDebug("tier_overlay", { tier: modelTierRes.tier, applied: false });
        }
      } catch (err) {
        streamDebug("tier_overlay", { tier: modelTierRes.tier, applied: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (adminPv) {
      adminPv.tier_overlay_text = tierOverlayCaptured;
      adminPv.tier_overlay_applied = !!tierOverlayCaptured;
    }

    // Runtime AI config (env overrides when explicitly off)
    const streamRuntimeConfig = await (await import("@/lib/ai/runtime-config")).getRuntimeAIConfig(supabase);
    // LLM v2 context (Phase A). Kill-switch: LLM_V2_CONTEXT=off or runtime forces raw path.
    let v2Summary: import("@/lib/deck/deck-context-summary").DeckContextSummary | null = null;
    /** Semantic fingerprint prose for key-card selector (v2 analyze path); optional. */
    let semanticFingerprintTextForKeyCards: string | null = null;
    let streamContextSource: "linked_db" | "paste_ttl" | "raw_fallback" = "raw_fallback";
    let streamSummaryTokensEstimate: number | null = null;
    let streamDeckHashForLog: string | null = null;
    let streamThreadHistory: Array<{ role: string; content: string }> = [];
    const streamV2BuildStart = Date.now();
    if (streamRuntimeConfig.flags.llm_v2_context !== false) {
      try {
        streamThreadHistory = streamThreadHistoryEarly.map((m) => ({ role: m.role, content: m.content ?? "" }));
        const {
          buildDeckContextSummary,
          getPasteSummary,
          setPasteSummary,
          estimateSummaryTokens,
        } = await import("@/lib/deck/deck-context-summary");
        // Phase 7: Unify v2/raw behind ActiveDeckContext
        const deckTextForV2 = activeDeckContext.hasDeck && activeDeckContext.decklistText ? activeDeckContext.decklistText.trim() : null;
        const hashForV2 = activeDeckContext.decklistHash;
        const summaryAnalyzeFormat = chatAnalyzeFormat(chatFmtResolved);
        if (deckTextForV2 && summaryAnalyzeFormat) {
          streamDeckHashForLog = hashForV2 || null;
          if (activeDeckContext.source === "linked" && activeDeckContext.deckId) {
            const admin = (await import("@/app/api/_lib/supa")).getAdmin();
            if (admin) {
              const { data: row } = await admin
                .from("deck_context_summary")
                .select("summary_json")
                .eq("deck_id", activeDeckContext.deckId)
                .eq("deck_hash", hashForV2)
                .maybeSingle();
              if (row?.summary_json) {
                v2Summary = row.summary_json as import("@/lib/deck/deck-context-summary").DeckContextSummary;
                streamContextSource = "linked_db";
              } else {
                v2Summary = await buildDeckContextSummary(deckTextForV2, {
                  format: summaryAnalyzeFormat,
                  ...(commanderLayersOn
                    ? { commander: deckData?.d?.commander ?? activeDeckContext.commanderName ?? null }
                    : {}),
                  colors: Array.isArray(deckData?.d?.colors) ? deckData.d.colors : [],
                });
                await admin.from("deck_context_summary").upsert(
                  { deck_id: activeDeckContext.deckId, deck_hash: hashForV2, summary_json: v2Summary },
                  { onConflict: "deck_id,deck_hash" }
                );
                streamContextSource = "linked_db";
              }
            } else {
              v2Summary = await buildDeckContextSummary(deckTextForV2, {
                format: summaryAnalyzeFormat,
                ...(commanderLayersOn
                  ? { commander: deckData?.d?.commander ?? activeDeckContext.commanderName ?? null }
                  : {}),
                colors: Array.isArray(deckData?.d?.colors) ? deckData.d.colors : [],
              });
              streamContextSource = "raw_fallback";
            }
          } else {
            const cached = getPasteSummary(hashForV2);
            if (cached) {
              v2Summary = cached;
              streamContextSource = "paste_ttl";
            } else {
              v2Summary = await buildDeckContextSummary(deckTextForV2, {
                format: summaryAnalyzeFormat,
                ...(commanderLayersOn ? { commander: activeDeckContext.commanderName ?? undefined } : {}),
              });
              setPasteSummary(hashForV2, v2Summary);
              streamContextSource = "paste_ttl";
            }
          }
          streamSummaryTokensEstimate = v2Summary ? estimateSummaryTokens(v2Summary) : null;
          if (activeDeckContext.source === "linked" && activeDeckContext.deckId && v2Summary) {
            try {
              const { snapshotDeckMetricsForDeck } = await import("@/lib/data-moat/snapshot-deck-metrics");
              await snapshotDeckMetricsForDeck(activeDeckContext.deckId, v2Summary as Record<string, unknown>);
            } catch (_) {}
          }
        }
        const streamV2BuildMs = Date.now() - streamV2BuildStart;
        if (v2Summary && streamV2BuildMs > 30_000) {
          console.warn(JSON.stringify({ tag: "slow_summary_build", route: "/api/chat/stream", ms: streamV2BuildMs }));
          v2Summary = null;
          streamContextSource = "raw_fallback";
          streamSummaryTokensEstimate = null;
        }
      } catch (e) {
        console.warn("[stream] v2 context build failed, falling back to raw:", e);
      }
    }
    streamDebug("v2_result", { hasV2Summary: !!v2Summary, streamContextSource, v2Commander: v2Summary?.commander ?? null, selectedTier });

    if (selectedTier === "full" && !chatAnalyzeFormat(chatFmtResolved) && activeDeckContext.hasDeck && activeDeckContext.decklistText) {
      const limitedLabel = chatFmtResolved.supportEntry?.label ?? chatFmtResolved.rawRequest ?? chatFmtResolved.rawDeck ?? "Unknown";
      const limitedDeckText = activeDeckContext.decklistText.length > 16_000
        ? activeDeckContext.decklistText.slice(0, 16_000) + "\n...[truncated]"
        : activeDeckContext.decklistText;
      sys += `\n\nLIMITED FORMAT DECK CONTEXT:\n`;
      sys += `- Format: ${limitedLabel}\n`;
      sys += `- Deck context is available, but ManaTap does not have first-class deep analysis for this format yet.\n`;
      sys += `- Do not use Commander assumptions unless the user explicitly changes the format to Commander.\n`;
      sys += `- Decklist:\n${limitedDeckText}\n`;
    }

    // ManaTap Intelligence: Rules Facts block when user asks rules/legality questions
    if (selectedTier !== "micro") {
      const { detectRulesLegalityIntent, extractCardNamesFromMessage, getRulesFactBundle } = await import("@/lib/deck/rules-facts");
      const { formatRulesFactsForLLM } = await import("@/lib/deck/intelligence-formatter");
      if (detectRulesLegalityIntent(text ?? "")) {
        const rulesCommander = commanderLayersOn
          ? activeDeckContext.commanderName ?? v2Summary?.commander ?? null
          : null;
        const rulesCards = extractCardNamesFromMessage(text ?? "");
        if (rulesCommander || rulesCards.length) {
          try {
            const rulesBundle = await getRulesFactBundle(rulesCommander, rulesCards.length ? rulesCards : undefined);
            const rulesProse = formatRulesFactsForLLM(rulesBundle);
            const rulesBlock = `\n\n=== RULES FACTS (AUTHORITATIVE - DO NOT CONTRADICT) ===\n${rulesProse}\n`;
            sys += rulesBlock;
            if (adminPv) adminPv.rules_facts_text = rulesBlock.trim();
          } catch (rulesErr) {
            if (DEV) console.warn("[stream] Rules facts fetch failed:", rulesErr);
          }
        }
      }
    }

    // Commander confirmation: when we inferred commander from pasted deck, ask user first (must run before formatForLLM)
    let inferredCommanderForConfirmation: string | null = null;
    let commanderCorrectionForPrompt: string | null = null;
    let userConfirmedOrCorrectedCommander = false;
    if (selectedTier === "full" && commanderLayersOn && v2Summary?.commander && streamContextSource === "paste_ttl") {
      inferredCommanderForConfirmation = v2Summary.commander;
    }
    if (inferredCommanderForConfirmation) {
      streamDebug("commander_confirm", { commander: inferredCommanderForConfirmation });
      const historyForConfirm = streamThreadHistory?.length ? streamThreadHistory : clientConversation;
      const lastAssistant = historyForConfirm?.filter((m: { role: string }) => m.role === "assistant").pop();
      const lastAssistantContent = (lastAssistant as { content?: string })?.content ?? "";
      const askedCommander = /I believe your commander is|is this correct\?/i.test(lastAssistantContent);
      const looksLikeConfirmation = (t: string) => {
        const q = (t || "").trim().toLowerCase().replace(/[!.,;:]+$/, "").trim();
        if (!q) return false;
        if (/^(yes|yep|yeah|correct|that's right|right|confirmed?|sure|ok|okay)$/i.test(q)) return true;
        if (/^no,?\s*(it'?s?|my commander is)\s+/i.test(q) || /^no\s+it'?s\s+/i.test(q)) return true;
        if (/^actually\s+(it'?s?|my commander is)\s+/i.test(q)) return true;
        if (/^(no|nope|wrong)\b/i.test(q) && q.length < 80) return true;
        if (q.length <= 15 && /^(yes|yep|yeah|correct|right|ok|okay|sure)/i.test(q)) return true;
        return false;
      };
      if ((tid || (isGuest && historyForConfirm?.length)) && askedCommander && looksLikeConfirmation(text ?? "")) {
        const raw = (text ?? "").trim();
        let corrected: string | null = null;
        const bracketMatch = raw.match(/(?:no,?\s*(?:it'?s?|my commander is)|actually\s+(?:it'?s?|my commander is)|no\s+it'?s)\s*[:\s]*\[\[([^\]]+)\]\]/i);
        if (bracketMatch) corrected = bracketMatch[1]?.trim() ?? null;
        else {
          const quotedMatch = raw.match(/(?:no,?\s*(?:it'?s?|my commander is)|actually\s+(?:it'?s?|my commander is)|no\s+it'?s)\s*[:\s]*["']([^"']+)["']/i);
          if (quotedMatch) corrected = quotedMatch[1]?.trim() ?? null;
          else {
            const plainMatch = raw.match(/(?:no,?\s*(?:it'?s?|my commander is)|actually\s+(?:it'?s?|my commander is)|no\s+it'?s)\s*[:\s]+([\s\S]+?)(?:\s*[.?!]|$)/i);
            if (plainMatch) corrected = plainMatch[1]?.trim()?.replace(/^["'\[\]]+|["'\[\]]+$/g, "") ?? null;
          }
        }
        if (!corrected && /^(no|nope|wrong)/i.test(raw)) {
          const fallback = raw.replace(/^(no|nope|wrong),?\s*/i, "").replace(/^(it'?s?|my commander is)\s*/i, "").trim();
          if (fallback.length > 2 && fallback.length < 80) corrected = fallback.replace(/^["'\[\]]+|["'\[\]]+$/g, "");
        }
        commanderCorrectionForPrompt = corrected;
        userConfirmedOrCorrectedCommander = true;
      }
    }

    if (selectedTier === "full" && v2Summary && streamInjected === "analyze") {
      // For simple queries, shrink card_names: intent-based top-K or trim to 25 (token creep guard). Only when doing analysis, not when asking for commander.
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
      let semanticFingerprintAppend = "";
      let recommendationSteeringAppend = "";
      if (v2Summary.deck_facts && v2Summary.synergy_diagnostics) {
        if (process.env.DEBUG_DECK_INTELLIGENCE === "1") {
          console.log(JSON.stringify({
            tag: "deck_intelligence",
            deck_facts: v2Summary.deck_facts,
            synergy_diagnostics: v2Summary.synergy_diagnostics,
            mode: "full",
          }));
        }
        const { formatForLLM, formatDeckPlanProfileForLLM } = await import("@/lib/deck/intelligence-formatter");
        const { buildDeckPlanProfile } = await import("@/lib/deck/deck-plan-profile");
        const commanderForFacts =
          commanderLayersOn && activeDeckContext.userJustCorrectedCommander ? activeDeckContext.commanderName : undefined;
        const deckFactsProse = formatForLLM(v2Summary.deck_facts, v2Summary.synergy_diagnostics, commanderForFacts ?? undefined);
        const deckIntelA = `\n\n=== DECK INTELLIGENCE (AUTHORITATIVE - DO NOT CONTRADICT) ===\n${deckFactsProse}\n`;
        sys += deckIntelA;
        const deckPlanOptions = {
          rampCards: v2Summary.ramp_cards,
          drawCards: v2Summary.draw_cards,
          removalCards: v2Summary.removal_cards,
        };
        const deckPlanProfile = buildDeckPlanProfile(v2Summary.deck_facts, v2Summary.synergy_diagnostics, deckPlanOptions);
        const deckPlanProse = formatDeckPlanProfileForLLM(deckPlanProfile);
        const deckIntelB = `\n${deckPlanProse}\n`;
        sys += deckIntelB;
        if (adminPv) adminPv.deck_intelligence_block_text = (deckIntelA + deckIntelB).trim();
      } else {
        const v2JsonBlock = `\n\nDECK CONTEXT SUMMARY (v2):\n${JSON.stringify(summaryForPrompt)}\n`;
        sys += v2JsonBlock;
        if (adminPv) adminPv.v2_summary_json_text = v2JsonBlock.trim();
      }
      if (process.env.DISABLE_DECK_SEMANTIC_FINGERPRINT !== "1") {
        try {
          streamDebug("semantic_fingerprint_start", { cardCount: v2Summary.card_names?.length ?? 0 });
          const { computeDeckSemanticFingerprint, formatFingerprintForPrompt } = await import("@/lib/ai/deck-semantic-fingerprint");
          const cardsForFp = (v2Summary.card_names ?? []).map((n: string) => ({ name: n, count: 1 }));
          const fp = await computeDeckSemanticFingerprint(cardsForFp);
          if (fp.cardCountAnalyzed > 0) {
            const fpStr = `\n\n${formatFingerprintForPrompt(fp)}\n`;
            semanticFingerprintAppend += fpStr;
            sys += fpStr;
            streamDebug("semantic_fingerprint_result", { oracleCoverage: fp.oracleCoverage, themes: fp.detectedThemes?.length ?? 0 });
            if (process.env.DISABLE_DECK_RECOMMENDATION_WEIGHTING !== "1") {
              try {
                const { deriveRecommendationWeightProfile, formatSteeringBlockForPrompt } = await import("@/lib/ai/recommendation-weighting");
                streamDebug("recommendation_weight_profile_start", {});
                const profile = deriveRecommendationWeightProfile(fp);
                if (profile) {
                  const stStr = `\n\n${formatSteeringBlockForPrompt(profile)}\n`;
                  recommendationSteeringAppend += stStr;
                  sys += stStr;
                  streamDebug("recommendation_weight_profile_result", { boosts: profile.boosts?.length ?? 0, suppressions: profile.suppressions?.length ?? 0 });
                }
              } catch (wpErr) {
                streamDebug("recommendation_weight_profile_failopen", { error: wpErr instanceof Error ? wpErr.message : String(wpErr) });
              }
            }
          }
        } catch (fpErr) {
          streamDebug("semantic_fingerprint_failopen", { error: fpErr instanceof Error ? fpErr.message : String(fpErr) });
        }
      }
      if (adminPv) {
        adminPv.semantic_fingerprint_text = semanticFingerprintAppend.trim() || null;
        adminPv.recommendation_steering_text = recommendationSteeringAppend.trim() || null;
      }
      semanticFingerprintTextForKeyCards = semanticFingerprintAppend.trim() || null;
      const cardsInDeckLine = `\nCards in deck (do NOT suggest these): ${cardNamesForPrompt.join(", ")}\n`;
      sys += cardsInDeckLine;
      if (adminPv) adminPv.cards_in_deck_line_text = cardsInDeckLine.trim();
      try {
        const { buildProtectedRoleCardsPrompt } = await import("@/lib/deck/protected-role-cards");
        const commanderForProtection =
          commanderLayersOn
            ? activeDeckContext.commanderName ?? v2Summary?.commander ?? deckData?.d?.commander ?? null
            : null;
        const protectedRolePrompt = await buildProtectedRoleCardsPrompt({
          deckText: cardNamesForPrompt.map((name: string) => `1 ${name}`).join("\n"),
          commander: commanderForProtection,
          limit: 14,
        });
        if (protectedRolePrompt) {
          sys += `\n${protectedRolePrompt}\n`;
        }
      } catch {}
      const { isDecklist } = await import("@/lib/chat/decklistDetector");
      const last6 = streamThreadHistory.filter((m) => m.role === "user" || m.role === "assistant").slice(-6);
      const redacted = last6.map((m) => {
        const content = typeof m.content === "string" ? m.content : "";
        const label = m.role === "user" ? "User" : "Assistant";
        const body = isDecklist(content) ? "(decklist provided; summarized)" : content;
        return `${label}: ${body}`;
      });
      let recent6Block = "";
      if (redacted.length > 0) {
        recent6Block = "\n\nRecent conversation (last 6 turns):\n" + redacted.join("\n");
        sys += recent6Block;
      }
      if (adminPv) adminPv.recent_conversation_block_text = recent6Block.trim() || null;
    }
    if (selectedTier === "full" && streamInjected === "analyze") {
      const commanderForGrounding = commanderLayersOn
        ? activeDeckContext.commanderName ?? v2Summary?.commander ?? deckData?.d?.commander ?? null
        : null;
      if (commanderForGrounding) {
        try {
          const { formatCommanderGroundingForPrompt } = await import("@/lib/deck/commander-grounding");
          const grounding = await formatCommanderGroundingForPrompt(commanderForGrounding);
          if (grounding) {
            const gBlock = `\n\n${grounding}`;
            sys += gBlock;
            if (adminPv) adminPv.commander_grounding_text = grounding.trim();
          }
        } catch (_) {}
      } else if (adminPv) {
        adminPv.commander_grounding_text = null;
        adminPv.notes.push("Commander authoritative grounding block not injected (no commander resolved for this path).");
      }
      try {
        const { selectKeyCardsForGrounding } = await import("@/lib/deck/select-key-cards");
        const { formatKeyCardsGroundingForPrompt, KEY_CARDS_GROUNDING_INSTRUCTION } = await import("@/lib/deck/key-card-grounding");
        const cardNamesFull =
          Array.isArray(v2Summary?.card_names) && v2Summary.card_names.length > 0
            ? (v2Summary.card_names as string[])
            : deckData?.entries?.length
              ? deckData.entries.map((e: { name: string }) => e.name)
              : [];
        if (cardNamesFull.length > 0) {
          const keyNames = await selectKeyCardsForGrounding({
            cardNames: cardNamesFull,
            commander: commanderForGrounding,
            v2Summary: v2Summary ?? null,
            fingerprintText: semanticFingerprintTextForKeyCards,
            maxCards: 5,
          });
          const keyBlock = await formatKeyCardsGroundingForPrompt(keyNames);
          streamDebug("key_cards_grounding", { selected: keyNames.length, injected: !!keyBlock });
          if (keyBlock) {
            sys += `\n\n${KEY_CARDS_GROUNDING_INSTRUCTION}\n\n${keyBlock}`;
            if (adminPv) adminPv.key_cards_grounding_text = keyBlock.trim();
          } else if (adminPv) {
            adminPv.key_cards_grounding_text = null;
          }
        } else if (adminPv) {
          adminPv.key_cards_grounding_text = null;
        }
      } catch (kcErr) {
        if (adminPv) {
          adminPv.key_cards_grounding_text = null;
          adminPv.notes.push(`Key cards grounding skipped: ${kcErr instanceof Error ? kcErr.message : String(kcErr)}`);
        }
      }
    }
    if (selectedTier === "full" && streamInjected === "analyze" && deckData && deckData.deckText.trim()) {
      const d = deckData.d;
      const formatForInfer = chatAnalyzeFormat(chatFmtResolved);
      if (!formatForInfer) {
        streamDebug("infer_skip_unsupported_format", {
          raw_request: chatFmtResolved.rawRequest,
          raw_deck: chatFmtResolved.rawDeck,
        });
      }
      let inferredContext: { format: string; colors: string[]; commander: string | null } = {
        format: formatForInfer ?? (chatFmtResolved.supportEntry?.label ?? chatFmtResolved.rawRequest ?? chatFmtResolved.rawDeck ?? "Unknown"),
        colors: [],
        commander: d?.commander ?? null,
      };
      if (formatForInfer && deckData.entries.length > 0) {
        try {
          const { inferDeckContext, fetchCard } = await import("@/lib/deck/inference");
          const byName = new Map<string, SfCard>();
          const unique = Array.from(new Set(deckData.entries.map((e: { name: string }) => e.name))).slice(0, 50);
          const looked = await Promise.all(unique.map((name: string) => fetchCard(name)));
          for (const c of looked) {
            if (c) byName.set(c.name.toLowerCase(), c);
          }
          inferredContext = await inferDeckContext(
            deckData.deckText,
            text,
            deckData.entries,
            formatForInfer,
            d?.commander ?? null,
            [],
            byName
          );
        } catch (_) {}
      }
      const { isAuthoritativeForPrompt } = await import("@/lib/chat/active-deck-context");
      const commanderForDeckContext =
        commanderLayersOn &&
        (isAuthoritativeForPrompt(activeDeckContext) && activeDeckContext.commanderName
          ? activeDeckContext.commanderName
          : inferredContext.commander);
      let deckCtxBlock = "";
      deckCtxBlock += `\n\nDECK CONTEXT (YOU ALREADY KNOW THIS - DO NOT ASK OR ASSUME):\n`;
      deckCtxBlock += `- Format: ${inferredContext.format} (this is the deck's format; do NOT say "Format unclear" or "I'll assume")\n`;
      deckCtxBlock += `- Colors: ${inferredContext.colors.join(", ") || "none"}\n`;
      if (commanderForDeckContext) deckCtxBlock += `- Commander: ${commanderForDeckContext}\n`;
      deckCtxBlock += `- Deck Title: ${d?.title || "Untitled Deck"}\n`;
      deckCtxBlock += `- Full Decklist:\n${deckData.deckText}\n`;
      deckCtxBlock += `- IMPORTANT: You already have the complete decklist above. Do NOT ask the user to share or provide the decklist. Start directly with analysis or suggestions.\n`;
      if (String(inferredContext.format).toLowerCase() !== "commander") {
        deckCtxBlock += `- Do NOT suggest Commander-only cards (e.g. Sol Ring, Command Tower). Only suggest cards legal in ${inferredContext.format}.\n`;
      }
      deckCtxBlock += `- Do NOT suggest cards already in the decklist above.\n`;
      deckCtxBlock += `- When describing draw vs filtering: card advantage = net gain of cards; Faithless Looting / Careful Study = filtering, not draw.\n`;
      sys += deckCtxBlock;
      if (adminPv) adminPv.deck_context_block_text = deckCtxBlock.trim();
    }

    // Few-shot learning (format anchoring): same as non-stream for consistent quality — full tier only, and only when doing analysis
    if (selectedTier === "full" && streamInjected === "analyze" && userId && !isGuest) {
      try {
        const { findSimilarExamples, formatExamplesForPrompt } = await import("@/lib/ai/few-shot-learning");
        const examples = await findSimilarExamples(text, undefined, undefined, 2);
        if (examples.length > 0) {
          const fewShotBlock = formatExamplesForPrompt(examples);
          sys += fewShotBlock;
          if (adminPv) adminPv.few_shot_examples_text = fewShotBlock.trim();
        }
      } catch (err) {
        console.warn("[chat/stream] Few-shot learning failed:", err instanceof Error ? err.message : String(err));
      }
    }

    if (selectedTier === "full" && streamInjected === "analyze" && !v2Summary) {
      // Same deck context for Pro and Guest when no v2Summary (Guest has no tid; or v2 was discarded). Only when doing analysis.
      let rawFallbackExtras = "";
      streamDebug("raw_path", { branch: deckContextForCompose?.deckCards?.length ? "deckContextForCompose" : tid ? "tid_messages" : "none", deckContextLen: deckContextForCompose?.deckCards?.length ?? 0 });
      if (deckContextForCompose?.deckCards?.length) {
        const { extractCommanderFromDecklistText, isDecklist } = await import("@/lib/chat/decklistDetector");
        const { analyzeDecklistFromText, generateDeckContext } = await import("@/lib/chat/enhancements");
        const deckTextForRaw = deckData?.deckText ?? (tid ? (() => {
          const lastDeck = streamThreadHistory?.slice().reverse().find((m: { role: string; content?: string }) => m.role === "user" && m.content && isDecklist(m.content));
          return lastDeck?.content ?? text ?? "";
        })() : (isGuest && clientConversation?.length ? (() => {
          const lastDeck = clientConversation.slice().reverse().find((m: { role: string; content?: string }) => m.role === "user" && m.content && isDecklist(m.content));
          return lastDeck?.content ?? text ?? "";
        })() : text ?? ""));
        const commanderForRaw =
          deckContextForCompose.commanderName ?? extractCommanderFromDecklistText(deckTextForRaw, text ?? undefined);
        if (commanderLayersOn && commanderForRaw && !inferredCommanderForConfirmation) {
          inferredCommanderForConfirmation = commanderForRaw;
        }
        streamDebug("raw_deck", { deckTextLen: (deckTextForRaw || text || "").length, commanderForRaw, hasTid: !!tid });
        const decklistContext = generateDeckContext(
          tid ? (() => { const m = streamThreadHistory?.slice().reverse().find((x: { role: string; content?: string }) => x.role === "user" && x.content && isDecklist(x.content)); return analyzeDecklistFromText(m?.content ?? deckTextForRaw); })()
            : (isGuest && clientConversation?.length ? (() => { const m = clientConversation.slice().reverse().find((x: { role: string; content?: string }) => x.role === "user" && x.content && isDecklist(x.content)); return analyzeDecklistFromText(m?.content ?? deckTextForRaw); })() : analyzeDecklistFromText(text || deckTextForRaw)),
          "Pasted Decklist",
          deckTextForRaw || text || undefined,
          commanderForRaw
        );
        if (decklistContext) {
          const chunk = "\n\n" + decklistContext;
          sys += chunk;
          rawFallbackExtras += chunk;
        }
        if (process.env.DISABLE_DECK_SEMANTIC_FINGERPRINT !== "1") {
          try {
            streamDebug("semantic_fingerprint_start", { cardCount: deckContextForCompose.deckCards.length });
            const { computeDeckSemanticFingerprint, formatFingerprintForPrompt } = await import("@/lib/ai/deck-semantic-fingerprint");
            const fp = await computeDeckSemanticFingerprint(deckContextForCompose.deckCards);
            if (fp.cardCountAnalyzed > 0) {
              const fpChunk = `\n\n${formatFingerprintForPrompt(fp)}\n`;
              sys += fpChunk;
              rawFallbackExtras += fpChunk;
              streamDebug("semantic_fingerprint_result", { oracleCoverage: fp.oracleCoverage, themes: fp.detectedThemes?.length ?? 0 });
              if (process.env.DISABLE_DECK_RECOMMENDATION_WEIGHTING !== "1") {
                try {
                  const { deriveRecommendationWeightProfile, formatSteeringBlockForPrompt } = await import("@/lib/ai/recommendation-weighting");
                  streamDebug("recommendation_weight_profile_start", {});
                  const profile = deriveRecommendationWeightProfile(fp);
                  if (profile) {
                    const stChunk = `\n\n${formatSteeringBlockForPrompt(profile)}\n`;
                    sys += stChunk;
                    rawFallbackExtras += stChunk;
                    streamDebug("recommendation_weight_profile_result", { boosts: profile.boosts?.length ?? 0, suppressions: profile.suppressions?.length ?? 0 });
                  }
                } catch (wpErr) {
                  streamDebug("recommendation_weight_profile_failopen", { error: wpErr instanceof Error ? wpErr.message : String(wpErr) });
                }
              }
            }
          } catch (fpErr) {
            streamDebug("semantic_fingerprint_failopen", { error: fpErr instanceof Error ? fpErr.message : String(fpErr) });
          }
        }
      } else if (tid) {
        try {
          const { isDecklist, extractCommanderFromDecklistText } = await import("@/lib/chat/decklistDetector");
          const { analyzeDecklistFromText, generateDeckContext } = await import("@/lib/chat/enhancements");
          // Prefer thread slot over scanning messages
          let rawDeckText: string | null = threadDecklistText;
          if (!rawDeckText) {
            const { data: messages } = await supabase.from("chat_messages").select("role, content").eq("thread_id", tid).order("created_at", { ascending: true }).limit(30);
            if (messages?.length) {
              for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i];
                if (msg.role === "user" && msg.content && isDecklist(msg.content)) {
                  rawDeckText = msg.content;
                  break;
                }
              }
            }
          }
          if (rawDeckText) {
            const commander = threadCommander ?? extractCommanderFromDecklistText(rawDeckText, text ?? undefined);
            if (commanderLayersOn && commander && !inferredCommanderForConfirmation) inferredCommanderForConfirmation = commander;
            const decklistContext = generateDeckContext(
              analyzeDecklistFromText(rawDeckText),
              "Pasted Decklist",
              rawDeckText,
              commanderLayersOn ? commander : null
            );
            if (decklistContext) {
              const chunk = "\n\n" + decklistContext;
              sys += chunk;
              rawFallbackExtras += chunk;
            }
            if (process.env.DISABLE_DECK_SEMANTIC_FINGERPRINT !== "1") {
              try {
                const { parseDeckText } = await import("@/lib/deck/parseDeckText");
                const { computeDeckSemanticFingerprint, formatFingerprintForPrompt } = await import("@/lib/ai/deck-semantic-fingerprint");
                const entries = parseDeckText(rawDeckText).map((e) => ({ name: e.name, count: e.qty }));
                if (entries.length > 0) {
                  streamDebug("semantic_fingerprint_start", { cardCount: entries.length });
                  const fp = await computeDeckSemanticFingerprint(entries);
                  if (fp.cardCountAnalyzed > 0) {
                    const fpChunk = `\n\n${formatFingerprintForPrompt(fp)}\n`;
                    sys += fpChunk;
                    rawFallbackExtras += fpChunk;
                    streamDebug("semantic_fingerprint_result", { oracleCoverage: fp.oracleCoverage, themes: fp.detectedThemes?.length ?? 0 });
                    if (process.env.DISABLE_DECK_RECOMMENDATION_WEIGHTING !== "1") {
                      try {
                        const { deriveRecommendationWeightProfile, formatSteeringBlockForPrompt } = await import("@/lib/ai/recommendation-weighting");
                        streamDebug("recommendation_weight_profile_start", {});
                        const profile = deriveRecommendationWeightProfile(fp);
                        if (profile) {
                          const stChunk = `\n\n${formatSteeringBlockForPrompt(profile)}\n`;
                          sys += stChunk;
                          rawFallbackExtras += stChunk;
                          streamDebug("recommendation_weight_profile_result", { boosts: profile.boosts?.length ?? 0, suppressions: profile.suppressions?.length ?? 0 });
                        }
                      } catch (wpErr) {
                        streamDebug("recommendation_weight_profile_failopen", { error: wpErr instanceof Error ? wpErr.message : String(wpErr) });
                      }
                    }
                  }
                }
              } catch (fpErr) {
                streamDebug("semantic_fingerprint_failopen", { error: fpErr instanceof Error ? fpErr.message : String(fpErr) });
              }
            }
          }
        } catch (_) {}
      }
      // Inject recent conversation for raw path (Pro with thread) or Guest (client-provided messages)
      const historyForRecent = (tid && streamThreadHistory?.length) ? streamThreadHistory : (isGuest && clientConversation?.length ? clientConversation : null);
      if (historyForRecent?.length) {
        const { isDecklist } = await import("@/lib/chat/decklistDetector");
        const last6 = historyForRecent.filter((m: { role: string }) => m.role === "user" || m.role === "assistant").slice(-6);
        const redacted = last6.map((m: { role: string; content?: string }) => {
          const content = typeof m.content === "string" ? m.content : "";
          const label = m.role === "user" ? "User" : "Assistant";
          const body = isDecklist(content) ? "(decklist provided; summarized)" : content;
          return `${label}: ${body}`;
        });
        if (redacted.length > 0) {
          const rc = "\n\nRecent conversation (last 6 turns):\n" + redacted.join("\n");
          sys += rc;
          rawFallbackExtras += rc;
        }
      }
      if (adminPv) adminPv.raw_fallback_extras_text = rawFallbackExtras.trim() || null;
    }

    let promptContractLog: { hasDeck: boolean; commanderStatus: string; askReason: string | null; injected: string; decision_reason?: string } = { hasDeck: false, commanderStatus: "missing", askReason: null, injected: "none" };
    if (selectedTier === "full") {
    promptContractLog = {
      hasDeck: activeDeckContext.hasDeck,
      commanderStatus: streamNormalizedState?.commanderStatus ?? activeDeckContext.commanderStatus,
      askReason: activeDeckContext.askReason,
      injected: streamInjected,
      decision_reason: streamDecisionReason ?? undefined,
    };
    streamDebug("prompt_contract", promptContractLog);

    let streamContractInjection = "";
    if (streamInjected === "analyze") {
      const a = `\n\nFormatting: Use "Step 1", "Step 2" (with a space after Step). Put a space after colons. Keep step-by-step analysis concise; lead with actionable recommendations. Do NOT suggest cards that are already in the decklist.`;
      const forbidCommanderFr = commanderLayersOn ? ", commander," : ",";
      const b =
        commanderLayersOn && activeDeckContext.commanderName
          ? `\n\n=== CRITICAL: COMMANDER CONFIRMED — ANALYZE NOW ===\nCommander is [[${activeDeckContext.commanderName}]]. Deck context is already available above. Begin full analysis immediately.\nFORBIDDEN: Do NOT ask for decklist, commander, format, budget, goals, or "what do you want to focus on?". Do NOT add preamble before Step 1. Your first sentence must be "Step 1:" followed by the first analysis step.`
          : `\n\n=== CRITICAL: DECK READY — ANALYZE NOW ===\nDeck context is already available above. Begin full analysis immediately.\nFORBIDDEN: Do NOT ask for decklist${forbidCommanderFr} format, budget, goals, or "what do you want to focus on?". Do NOT add preamble before Step 1. Your first sentence must be "Step 1:" followed by the first analysis step.`;
      streamContractInjection = a + b;
      sys += a + b;
      if (
        commanderLayersOn &&
        (activeDeckContext.userJustConfirmedCommander || activeDeckContext.userJustCorrectedCommander)
      ) {
        if (tid && !isGuest) {
          try {
            const status = activeDeckContext.userJustCorrectedCommander ? "corrected" : "confirmed";
            await supabase.from("chat_threads").update({ commander: activeDeckContext.commanderName, commander_status: status }).eq("id", tid);
          } catch (_) {}
        }
      }
    } else if (streamInjected === "confirm" && commanderLayersOn && activeDeckContext.commanderName) {
      streamContractInjection = `\n\nCRITICAL: Ask only this, nothing else: "Is [[${activeDeckContext.commanderName}]] your commander?" Do not ask for decklist, goals, or provide analysis.`;
      sys += streamContractInjection;
    } else if (streamInjected === "ask_commander" && commanderLayersOn) {
      const bestCandidate = activeDeckContext.commanderCandidates?.[0]?.name;
      if (bestCandidate) {
        streamContractInjection = `\n\nCRITICAL: Ask only this, nothing else: "Is [[${bestCandidate}]] your commander?" Do not ask for decklist, goals, or provide analysis.`;
      } else {
        streamContractInjection = `\n\nCRITICAL: Ask only this, nothing else: "Please name your commander for this deck." Do not ask for decklist, goals, or provide analysis.`;
      }
      sys += streamContractInjection;
    }
    if (adminPv) adminPv.stream_contract_injection_text = streamContractInjection.trim() || null;
    }

    // Thread summary (within-thread memory) - same logic as non-stream
    if (tid && !isGuest && selectedTier !== "micro") {
      const { data: summaryMsgs } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("thread_id", tid)
        .order("created_at", { ascending: true })
        .limit(30);
      const threadHistoryForSummary = Array.isArray(summaryMsgs) ? summaryMsgs : [];
      const { injectThreadSummaryContext } = await import("@/lib/chat/chat-context-builder");
      const summaryResult = await injectThreadSummaryContext(
        supabase,
        tid,
        threadHistoryForSummary,
        userId,
        isPro,
        isGuest,
        anonId
      );
      if (summaryResult.formatted) {
        sys += summaryResult.formatted;
        if (adminPv) adminPv.thread_memory_block_text = summaryResult.formatted.trim();
      }
    }

    // Pro cross-thread memory: inject saved preferences
    if (userId && isPro) {
      const { getProUserPreferences, formatProPreferencesForPrompt } = await import("@/lib/chat/chat-context-builder");
      const savedPrefs = await getProUserPreferences(supabase, userId, isPro);
      if (savedPrefs) {
        const proPrefsFormatted = formatProPreferencesForPrompt(savedPrefs);
        if (proPrefsFormatted) {
          sys += proPrefsFormatted;
          if (adminPv) adminPv.pro_cross_thread_prefs_text = proPrefsFormatted.trim();
        }
      }
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

    // Layer 0 treats bare card names (e.g. commander replies) as non-MTG via keyword check — must not run before chat + activeDeckContext.
    const awaitingCommanderConfirmation =
      commanderLayersOn &&
      activeDeckContext.hasDeck &&
      (activeDeckContext.askReason === "confirm_inference" || activeDeckContext.askReason === "need_commander");
    const skipLayer0ForCommanderFlow =
      activeDeckContext.userJustConfirmedCommander ||
      activeDeckContext.userJustCorrectedCommander ||
      awaitingCommanderConfirmation;
    if (skipLayer0ForCommanderFlow) {
      streamDebug("layer0_skip_commander_flow", {
        awaitingCommanderConfirmation,
        userJustConfirmedCommander: activeDeckContext.userJustConfirmedCommander,
        userJustCorrectedCommander: activeDeckContext.userJustCorrectedCommander,
        askReason: activeDeckContext.askReason,
      });
    }

    // Layer 0: deterministic / mini-only gate (runtime or env LLM_LAYER0=on)
    const { isDecklist: isDecklistForLayer0 } = await import("@/lib/chat/decklistDetector");
    const streamHasDeckContextForLayer0 =
      !!v2Summary ||
      !!(deckData?.deckText?.trim()) ||
      !!(text && isDecklistForLayer0(text));
    let streamLayer0Mode: string | null = null;
    let streamLayer0Reason: string | null = null;
    let streamLayer0MiniOnly: { model: string; max_tokens: number } | null = null;
    const streamForceFullRoutes = streamRuntimeConfig.llm_force_full_routes ?? [];
    const streamForceFull = Array.isArray(streamForceFullRoutes) && streamForceFullRoutes.includes("chat_stream");
    if (!streamForceFull && !skipLayer0ForCommanderFlow) {
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
        isPro,
        hasChatHistory: streamThreadHistory.length > 0,
      });
      if (decision.mode === "NO_LLM") {
        let actualHandler: string = decision.handler;
        if (decision.handler === "off_topic_ai_check") {
          const { layer0OffTopicAICheck } = await import("@/lib/ai/layer0-gate");
          const isOffTopic = await layer0OffTopicAICheck(text, streamThreadHistory);
          actualHandler = isOffTopic ? "off_topic" : "proceed_full_llm";
        }
        if (actualHandler === "proceed_full_llm") {
          streamLayer0Mode = "FULL_LLM";
          streamLayer0Reason = "off_topic_ai_check_mtg_related";
        } else {
        let responseText: string;
        if (actualHandler === "need_more_info") {
          if (!text.trim()) {
            responseText = "Please enter your question or paste a decklist.";
          } else {
            responseText =
              "To analyze or improve a deck, please link a deck to this chat or paste your decklist in the message. You can link a deck from the deck selector in the chat header, or paste a list (one card per line, e.g. 1 Sol Ring).";
          }
        } else if (decision.handler === "static_faq") {
          responseText = getFaqAnswer(text) ?? "I don't have a canned answer for that. Try asking in different words or use the full AI.";
        } else if (actualHandler === "off_topic") {
          responseText = "ManaTap is focused on MTG deckbuilding and rules - ask me MTG stuff or be more specific.";
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
          source_page: sourcePage,
          source: streamAiUsageSource,
          request_kind: "NO_LLM",
          context_source: streamContextSource,
          layer0_mode: "NO_LLM",
          layer0_reason: decision.reason,
          is_guest: isGuest,
          user_tier: modelTierRes.tier,
        });
        if (clientEntrySource) {
          try {
            const { captureServer } = await import("@/lib/server/analytics");
            await captureServer(
              "chat_sent",
              {
                route: "chat_stream",
                layer0: "NO_LLM",
                ms: Date.now() - t0,
                thread_id: tid,
                user_id: userId,
                user_message: text ? text.slice(0, 200) : null,
                assistant_message: responseText ? responseText.slice(0, 200) : null,
                source: clientEntrySource,
              },
              userId ?? undefined
            );
          } catch (_) {}
        }
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
      }
      if (decision.mode === "MINI_ONLY" && streamRuntimeConfig.flags.llm_layer0 === true) {
        streamLayer0Mode = "MINI_ONLY";
        streamLayer0Reason = decision.reason;
        streamLayer0MiniOnly = { model: decision.model, max_tokens: decision.max_tokens };
      } else {
        streamLayer0Mode = "FULL_LLM";
        streamLayer0Reason = decision.reason;
      }
    }

    const deckChange = await maybeCreateDeckChangeProposal({
      supabase,
      userId,
      threadId: tid,
      deckId: deckIdLinked,
      text,
    }).catch((e) => {
      console.warn("[stream] Deck change proposal failed:", e);
      return null;
    });
    if (deckChange) {
      const metadata: ChatTurnMetadata = {
        threadId: tid,
        persisted: false,
        pendingDeckAction: deckChange.proposal,
        toolResults: [],
      };
      const saved = await persistAssistantMessage(supabase, {
        threadId: tid,
        content: deckChange.assistantText,
        metadata,
        isGuest,
      });
      metadata.assistantMessageId = saved.id;
      metadata.persisted = saved.persisted;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(deckChange.assistantText));
          controller.enqueue(encoder.encode(encodeChatMetadata(metadata)));
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

    const chatToolResults: ChatToolResult[] = await runChatToolPlanner({
      origin: new URL(req.url).origin,
      cookieHeader: req.headers.get("cookie"),
      authHeader: req.headers.get("Authorization"),
      text,
      deckText: deckData?.deckText || null,
      deckId: deckIdLinked,
      format: deckData?.d?.format || chatFmtResolved.supportEntry?.label || chatFmtResolved.canonical || null,
      commander: deckData?.d?.commander || null,
      currency: typeof prefs?.currency === "string" ? prefs.currency : "USD",
      sourcePage,
    }).catch((e) => {
      console.warn("[stream] Tool planner failed:", e);
      return [] as ChatToolResult[];
    });
    const deckTextForIntelligence =
      deckData?.deckText?.trim() ||
      activeDeckContext.decklistText?.trim() ||
      "";
    const intelligencePacket = deckTextForIntelligence
      ? await buildDeckIntelligencePacket({
          supabase,
          userId,
          isGuest,
          isPro,
          deckId: deckIdLinked,
          deckText: deckTextForIntelligence,
          format: deckData?.d?.format || chatFmtResolved.supportEntry?.label || chatFmtResolved.canonical || null,
          commander: deckData?.d?.commander || activeDeckContext.commanderName || null,
        }).catch((e) => {
          console.warn("[stream] Deck intelligence packet failed:", e);
          return null;
        })
      : null;
    if (intelligencePacket) {
      chatToolResults.push(...buildIntelligenceToolResults(intelligencePacket));
    }
    const directToolAnswer = buildDirectChatToolAnswer(text, chatToolResults);
    if (directToolAnswer) {
      const metadata: ChatTurnMetadata = {
        threadId: tid,
        persisted: false,
        toolResults: summarizeToolResults(chatToolResults),
        pendingDeckAction: null,
      };
      const saved = await persistAssistantMessage(supabase, {
        threadId: tid,
        content: directToolAnswer,
        metadata,
        isGuest,
      });
      metadata.assistantMessageId = saved.id;
      metadata.persisted = saved.persisted;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(directToolAnswer));
          controller.enqueue(encoder.encode(encodeChatMetadata(metadata)));
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
    const directDeckAnswer = buildDirectDeckContextAnswer({
      text,
      deckText: deckData?.deckText || null,
      format: deckData?.d?.format || chatFmtResolved.supportEntry?.label || chatFmtResolved.canonical || null,
      commander: deckData?.d?.commander || null,
    });
    if (directDeckAnswer) {
      const metadata: ChatTurnMetadata = {
        threadId: tid,
        persisted: false,
        toolResults: summarizeToolResults(chatToolResults),
        pendingDeckAction: null,
      };
      const saved = await persistAssistantMessage(supabase, {
        threadId: tid,
        content: directDeckAnswer,
        metadata,
        isGuest,
      });
      metadata.assistantMessageId = saved.id;
      metadata.persisted = saved.persisted;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(directDeckAnswer));
          controller.enqueue(encoder.encode(encodeChatMetadata(metadata)));
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
    const toolPrompt = buildToolResultsPrompt(chatToolResults);
    if (toolPrompt) sys += `\n\n${toolPrompt}`;

    const intelligencePrompt = formatDeckIntelligencePacketForPrompt(intelligencePacket);
    if (intelligencePrompt) sys += `\n\n${intelligencePrompt}`;

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

    if (adminPv) {
      adminPv.final_system_prompt_exact = sys;
      adminPv.notes.push(
        "final_system_prompt_exact is the full system message string passed to OpenAI for this request (same as messages[0].content).",
      );
    }

    // Phase B: token ceiling and stop sequences (no reply shortening; use full ceiling for all tiers)
    const { CHAT_STOP_SEQUENCES } = await import('@/lib/ai/chat-generation-config');
    let tokenLimit = MAX_TOKENS_STREAM;
    if (streamLayer0MiniOnly) {
      effectiveModel = streamLayer0MiniOnly.model;
      tokenLimit = MAX_TOKENS_STREAM; // No cap: allow full responses for MINI_ONLY
    } else if (!!v2Summary || !!(deckContextForCompose?.deckCards?.length)) {
      // Temporary/test-friendly: deck analysis gets higher cap so full 8-step + Report Card doesn't truncate
      tokenLimit = MAX_TOKENS_DECK_ANALYSIS;
    }

    // Create OpenAI streaming request (model by user tier: guest/free/pro)
    const messages: any[] = [
      { role: "system", content: sys },
      { role: "user", content: text }
    ];
    
    const modelsWithoutStop = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5-mini", "gpt-5-nano", "gpt-5.1", "gpt-5"];
    const useStop = !modelsWithoutStop.some((m) => effectiveModel?.toLowerCase().includes(m));
    const openAIBody = prepareOpenAIBody({
      model: effectiveModel,
      messages,
      stream: true,
      max_completion_tokens: tokenLimit,
      ...(useStop && { stop: CHAT_STOP_SEQUENCES }),
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
        const fallbackModel = modelTierRes.fallbackModel;
        const fallbackUseStop = !modelsWithoutStop.some((m) => fallbackModel?.toLowerCase().includes(m));
        const fallbackBody = prepareOpenAIBody({
          model: fallbackModel,
          messages,
          max_completion_tokens: tokenLimit,
          stream: true,
          ...(fallbackUseStop && { stop: CHAT_STOP_SEQUENCES }),
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

    const wantDebug = req.headers.get("x-debug-chat") === "1";
    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (wantDebug) {
            const norm = streamNormalizedState;
            const path = activeDeckContext.debug?.resolutionPath ?? [];
            const commander_resolution_source =
              path.includes("commander:linked")
                ? "linked_deck"
                : path.includes("commander:explicit_marker")
                  ? "explicit_deck_marker"
                  : path.includes("commander:user_named")
                    ? "user_named_commander"
                    : path.includes("commander:thread") || activeDeckContext.userJustConfirmedCommander || activeDeckContext.userJustCorrectedCommander
                      ? "explicit_user_reply"
                      : path.includes("commander:parsed")
                        ? "inferred_candidate"
                        : path.includes("commander:none")
                          ? "unknown"
                          : "unknown";
            const analyze_gate_reason =
              streamInjected === "analyze"
                ? path.includes("commander:linked")
                  ? "linked_trusted"
                  : path.includes("commander:explicit_marker")
                    ? "explicit_marker"
                    : path.includes("commander:user_named")
                      ? "user_named_commander"
                      : path.includes("commander:thread") || activeDeckContext.userJustConfirmedCommander || activeDeckContext.userJustCorrectedCommander
                        ? "user_confirmed"
                        : "user_confirmed"
                : streamInjected === "confirm"
                  ? "ambiguous_need_confirm"
                  : streamInjected === "ask_commander"
                    ? "missing_need_commander"
                    : null;
            const composeQtyTotal =
              deckContextForCompose?.deckCards?.reduce((acc, e) => {
                const n = Math.max(1, Math.floor(Number(e.count ?? 1) || 0));
                return acc + n;
              }, 0) ?? 0;
            const debugDeckCardCount =
              linkedDeckCardCounts?.deck_card_count ?? (composeQtyTotal > 0 ? composeQtyTotal : null);
            const debugMainboardCardCount = linkedDeckCardCounts?.mainboard_card_count ?? null;
            const debugSideboardCardCount = linkedDeckCardCounts?.sideboard_card_count ?? null;

            const debugPayload = {
              ts: Date.now(),
              phase: "start",
              decision: promptContractLog.injected,
              decision_reason: promptContractLog.decision_reason ?? null,
              commander_confirm_required: norm?.commander_confirm_required ?? (promptContractLog.askReason === "confirm_inference" || promptContractLog.askReason === "need_commander"),
              commander_confirmed: norm?.commander_confirmed ?? (promptContractLog.commanderStatus === "confirmed" || promptContractLog.commanderStatus === "corrected"),
              commander_resolution_source,
              commander_trusted_for_analysis: norm?.trusted_commander_for_analysis ?? (streamInjected === "analyze" && !!(deckContextForCompose?.deckCards?.length)),
              analyze_gate_reason,
              promptPath: promptResult.promptPath,
              promptVersionId: promptResult.promptVersionId ?? null,
              model: effectiveModel,
              tier: modelTierRes.tier,
              tokenLimit,
              useStop,
              layer0_mode: streamLayer0Mode ?? null,
              layer0_reason: streamLayer0Reason ?? null,
              commander_candidate_count: activeDeckContext.commanderCandidates?.length ?? 0,
              candidate_confidence_top: activeDeckContext.commanderCandidates?.[0]?.confidence ?? null,
              confirm_question_expected: streamInjected === "confirm" || streamInjected === "ask_commander",
              previous_turn_was_ask_commander: activeDeckContext.lastTurnAskedCommander ?? false,
              user_reply_promoted_to_commander: activeDeckContext.userJustConfirmedCommander || activeDeckContext.userJustCorrectedCommander,
              promotion_reason: activeDeckContext.promotionSource ?? "none",
              active_deck_context: {
                hasDeck: activeDeckContext.hasDeck,
                source: activeDeckContext.source,
                deckId: activeDeckContext.deckId,
                commanderName: activeDeckContext.commanderName,
                commanderStatus: promptContractLog.commanderStatus,
                askReason: activeDeckContext.askReason,
                commanderCandidates: activeDeckContext.commanderCandidates,
                resolutionPath: path,
                deckReplacedByHashChange: activeDeckContext.deckReplacedByHashChange,
              },
              stream_context_source: streamContextSource,
              deck_hash: streamDeckHashForLog,
              prompt_tier: selectedTier,
              prompt_contract: promptContractLog,
              format_key: formatKey,
              chat_format_resolution: {
                canonical: chatFmtResolved.canonical,
                format_source: chatFmtResolved.source,
                rawRequest: chatFmtResolved.rawRequest,
                rawDeck: chatFmtResolved.rawDeck,
              },
              commanderLayersOn,
              applyCommanderNameGating: commanderLayersOn,
              mayAnalyze: mayAnalyzeDebug,
              deck_card_count: debugDeckCardCount,
              mainboard_card_count: debugMainboardCardCount,
              sideboard_card_count: debugSideboardCardCount,
              analyze_now_expected: norm?.analyze_now_expected ?? (selectedTier === "full" && streamInjected === "analyze" && !!(deckContextForCompose?.deckCards?.length) && (promptContractLog.commanderStatus === "confirmed" || promptContractLog.commanderStatus === "corrected")),
              has_full_deck_context: !!(deckContextForCompose?.deckCards?.length),
              extra_clarification_allowed: norm?.extra_clarification_allowed ?? !(selectedTier === "full" && streamInjected === "analyze" && !!(deckContextForCompose?.deckCards?.length) && (promptContractLog.commanderStatus === "confirmed" || promptContractLog.commanderStatus === "corrected")),
              prompt_mode: streamInjected,
              ...(norm && {
                normalization_applied: norm.normalization_applied,
                confirmation_source: norm.confirmation_source,
                trusted_commander_for_analysis: norm.trusted_commander_for_analysis,
                state_was_contradictory_before_normalization: norm.state_was_contradictory_before_normalization,
              }),
              v2_summary_used: !!v2Summary,
              v2_card_count: v2Summary?.card_count ?? null,
              deck_context_cards: deckContextForCompose?.deckCards?.length ?? 0,
              ...(adminPv ? { prompt_preview: adminPv } : {}),
            };
            controller.enqueue(encoder.encode(`__MANATAP_DEBUG__\n${JSON.stringify(debugPayload)}\n__MANATAP_DEBUG_END__\n`));
          }
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
            if (estimatedTokens > tokenLimit) break;

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
          const lenRaw = outputText.length;
          let askCommanderSafetyNetUsed = false;
          const { trimOutroLines } = await import("@/lib/chat/outputCleanupFilter");
          outputText = trimOutroLines(outputText);
          const lenAfterTrimOutro = outputText.length;
          let lenBeforeSynergy: number | null = null;
          let lenAfterSynergy: number | null = null;
          let lenAfterTruncation: number | null = null;
          let synergyRemoved = false;
          let truncationRemoved = false;
          let cleanupSynergySkippedForDeckAnalysis = false;
          const deckCards = deckContextForCompose?.deckCards ?? [];
          const skipRecommendationCleanup = shouldSkipRecommendationCleanupForChatTurn(text);
          if (!skipRecommendationCleanup && deckCards.length > 0 && outputText) {
            try {
              const formatForLegality = chatFormatForLegality(chatFmtResolved);
              if (!formatForLegality) {
                throw new Error("Skipping recommendation legality validation: unknown chat format");
              }
              const formatKeyVal = (commanderLayersOn ? "commander" : "modern") as "commander" | "modern" | "pioneer";
              const { validateRecommendations, REPAIR_SYSTEM_MESSAGE, formatValidationWarning, shouldAutoEscalate } = await import("@/lib/chat/validateRecommendations");
              const originalOutputText = outputText; // Save for auto-escalation
              let result = await validateRecommendations({
                deckCards: deckCards.map((c) => ({ name: c.name })),
                formatKey: formatKeyVal,
                colorIdentity: deckContextForCompose?.colorIdentity ?? null,
                commanderName: deckContextForCompose?.commanderName ?? null,
                rawText: outputText,
                formatForLegality,
              });
              let validationWarning: string | null = null;
              if (!result.valid && result.issues.length > 0) {
                if (DEV) console.warn("[stream] Recommendation validation issues:", result.issues.map((i) => i.message));
                outputText = result.repairedText;
                validationWarning = formatValidationWarning(result.issues);
                
                // Auto-escalate serious issues for human review
                if (shouldAutoEscalate(result.issues)) {
                  try {
                    const supabase = await getServerSupabase();
                    await supabase.from('ai_human_reviews').insert({
                      source: 'auto_escalation',
                      route: '/api/chat/stream',
                      input: { user_message: text, thread_id: tid, format: formatKeyVal },
                      output: outputText,
                      labels: { issues: result.issues.map(i => ({ kind: i.kind, card: i.card, message: i.message })) },
                      status: 'pending',
                      meta: { original_response: originalOutputText, repaired: true }
                    });
                    console.log('[stream] Auto-escalated response for human review due to:', result.issues.map(i => i.kind).join(', '));
                  } catch (escErr) {
                    console.warn('[stream] Failed to auto-escalate:', escErr);
                  }
                }
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
                    ...(useStop && { stop: CHAT_STOP_SEQUENCES }),
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
                        formatForLegality,
                      });
                      if (!result.valid && result.issues.length > 0) outputText = result.repairedText;
                    }
                  }
                } catch (regenErr) {
                  if (DEV) console.warn("[stream] regeneration request failed:", regenErr);
                }
              }
              const { applyOutputCleanupFilter, applyBracketEnforcement } = await import("@/lib/chat/outputCleanupFilter");
              lenBeforeSynergy = outputText.length;
              lenAfterSynergy = outputText.length;
              lenAfterTruncation = outputText.length;
              synergyRemoved = false;
              truncationRemoved = false;
              cleanupSynergySkippedForDeckAnalysis = true; // No reply shortening
              outputText = applyOutputCleanupFilter(outputText);
              outputText = applyBracketEnforcement(outputText);
              try {
                const { stripIllegalBracketCardTokensFromText } = await import("@/lib/deck/recommendation-legality");
                outputText = await stripIllegalBracketCardTokensFromText(outputText, formatForLegality, {
                  logPrefix: "/api/chat/stream bracket legality",
                });
              } catch {
                /* non-fatal */
              }
              // Append validation warning if any cards were removed
              if (validationWarning) {
                outputText = outputText + validationWarning;
              }
              if (DEV) {
                const { humanSanityCheck } = await import("@/lib/chat/humanSanityCheck");
                const flags = humanSanityCheck(outputText);
                if (!flags.feelsHuman || flags.instructionalPhrases.length > 0)
                  console.warn("[stream] humanSanityCheck flags:", flags);
              }
              // Tiny safety net: Commander ask_commander with full deck context must not re-ask for decklist
              if (
                commanderLayersOn &&
                streamInjected === "ask_commander" &&
                outputText &&
                /paste your decklist|provide your decklist|send the full list|share your decklist|full decklist|paste the decklist|provide the decklist/i.test(outputText)
              ) {
                const candidate = activeDeckContext.commanderCandidates?.[0]?.name ?? activeDeckContext.commanderName ?? null;
                outputText = candidate ? `Is [[${candidate}]] your commander for this deck?` : "Please name your commander for this deck.";
                askCommanderSafetyNetUsed = true;
              }
            } catch (e) {
              if (DEV) console.warn("[stream] validateRecommendations/cleanup error:", e);
            }
          } else if (!skipRecommendationCleanup && outputText && outputText.includes("[[")) {
            try {
              const formatForLegality = chatFormatForLegality(chatFmtResolved);
              if (!formatForLegality) throw new Error("Skipping bracket legality cleanup: unknown chat format");
              const { stripIllegalBracketCardTokensFromText } = await import("@/lib/deck/recommendation-legality");
              outputText = await stripIllegalBracketCardTokensFromText(outputText, formatForLegality, {
                logPrefix: "/api/chat/stream bracket legality (no deck)",
              });
            } catch {
              /* non-fatal */
            }
          }
          if (outputText && outputText.includes("[[")) {
            try {
              const { stripNonCardRuleTermBrackets } = await import("@/lib/deck/recommendation-legality");
              outputText = stripNonCardRuleTermBrackets(outputText);
            } catch {
              /* non-fatal */
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
              source_page: sourcePage,
              source: streamAiUsageSource,
              request_kind: streamLayer0Mode ?? undefined,
              layer0_mode: streamLayer0Mode ?? undefined,
              layer0_reason: streamLayer0Reason ?? undefined,
              prompt_preview: typeof text === "string" ? text.slice(0, 1000) : null,
              response_preview: typeof outputText === "string" ? outputText.slice(0, 1000) : null,
              model_tier: modelTierRes.tier,
              context_source: streamContextSource !== "raw_fallback" ? streamContextSource : undefined,
              summary_tokens_estimate: streamSummaryTokensEstimate ?? undefined,
              deck_hash: streamDeckHashForLog ?? undefined,
              has_deck_context: streamHasDeckContextForLayer0,
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

          if (clientEntrySource) {
            try {
              const { captureServer } = await import("@/lib/server/analytics");
              await captureServer(
                "chat_sent",
                {
                  route: "chat_stream",
                  ms: Date.now() - t0,
                  thread_id: tid,
                  user_id: userId,
                  user_message: text ? text.slice(0, 200) : null,
                  assistant_message: outputText ? outputText.slice(0, 200) : null,
                  source: clientEntrySource,
                  has_deck_context: streamHasDeckContextForLayer0,
                },
                userId ?? undefined
              );
            } catch (_) {}
          }

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
                    deck_context_included: streamHasDeckContextForLayer0,
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

          const responseMetadata: ChatTurnMetadata = {
            threadId: tid,
            persisted: false,
            toolResults: summarizeToolResults(chatToolResults),
            pendingDeckAction: null,
          };
          try {
            const saved = await persistAssistantMessage(supabase, {
              threadId: tid,
              content: outputText,
              metadata: responseMetadata,
              isGuest,
            });
            responseMetadata.assistantMessageId = saved.id;
            responseMetadata.persisted = saved.persisted;
          } catch (e) {
            console.warn("[stream] Failed to persist assistant message:", e);
          }

          const lenFinal = outputText.length;
          const CHUNK_SIZE = 120;
          for (let i = 0; i < outputText.length; i += CHUNK_SIZE) {
            controller.enqueue(encoder.encode(outputText.slice(i, i + CHUNK_SIZE)));
          }
          controller.enqueue(encoder.encode(encodeChatMetadata(responseMetadata)));
          if (wantDebug) {
            const streamDurationMs = Date.now() - streamStartTime;
            const cleanupCharsSynergy = lenBeforeSynergy != null && lenAfterSynergy != null ? lenBeforeSynergy - lenAfterSynergy : null;
            const cleanupCharsTruncation = lenAfterSynergy != null && lenAfterTruncation != null ? lenAfterSynergy - lenAfterTruncation : (lenBeforeSynergy != null ? lenBeforeSynergy - lenFinal : null);
            const hasReportCard = /Deck\s+Report\s+Card|Step\s+8/i.test(outputText);
            const hasSteps = /Step\s+\d/i.test(outputText);
            // Prefer actual content: if output has analysis structure, label as analysis; only label ask_commander when content matches (no steps)
            const looksLikeAnalysis = hasSteps || hasReportCard;
            const responseShapeGuess = looksLikeAnalysis
              ? (hasReportCard && hasSteps ? "full_analysis" : hasSteps ? "partial_analysis" : "other")
              : promptContractLog.injected === "confirm" || promptContractLog.injected === "ask_commander"
                ? "ask_commander"
                : promptContractLog.injected === "analyze"
                  ? "other"
                  : "other";
            const opening = outputText.slice(0, 160).toLowerCase();
            const openingLooksLikeAnalysis = /^step\s+1\b/.test(opening);
            const openingLooksLikeClarification =
              /before i dive in/.test(opening) ||
              /before we dive in/.test(opening) ||
              /what (are|do) you (want|want to|want this deck to)/.test(opening) ||
              /what (kind of|sort of) (build|deck)/.test(opening) ||
              /what are your goals/.test(opening);
            const outputOpeningGuess = openingLooksLikeAnalysis ? "analysis" : openingLooksLikeClarification ? "clarification" : "other";
            const endStreamPayload = {
              phase: "end",
              ts: Date.now(),
              stream_duration_ms: streamDurationMs,
              lenRaw,
              lenAfterTrimOutro,
              lenAfterSynergy,
              lenAfterTruncation,
              lenFinal,
              synergyRemoved,
              truncationRemoved,
              cleanup_chars_removed_synergy: cleanupCharsSynergy,
              cleanup_chars_removed_truncation: cleanupCharsTruncation,
              truncation_guess: truncationRemoved ? "stripIncompleteTruncation removed content" : synergyRemoved ? "stripIncompleteSynergyChains removed content" : null,
              response_shape_guess: responseShapeGuess,
              output_opening_guess: outputOpeningGuess,
              cleanup_synergy_skipped_for_deck_analysis: cleanupSynergySkippedForDeckAnalysis,
              ask_commander_safety_net_used: askCommanderSafetyNetUsed,
            };
            controller.enqueue(encoder.encode(`__MANATAP_DEBUG_END_STREAM__\n${JSON.stringify(endStreamPayload)}\n__MANATAP_DEBUG_END__\n`));
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
