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

    // Guest user limit checking (server-side enforcement)
    if (isGuest) {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const guestToken = cookieStore.get('guest_session_token')?.value || null;
      
      // Extract IP and User-Agent
      const forwarded = req.headers.get('x-forwarded-for');
      const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || 'unknown';
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

    const promptResult = await buildSystemPromptForRequest({
      kind: "chat",
      formatKey,
      deckContextForCompose,
      supabase,
      hardcodedDefaultPrompt: CHAT_HARDCODED_DEFAULT,
    });
    let sys = promptResult.systemPrompt;
    const promptVersionId = promptResult.promptVersionId ?? null;

    let promptLogged = false;
    if (!promptLogged) {
      promptLogged = true;
      console.log(JSON.stringify({
        tag: "prompt",
        requestId: promptRequestId,
        promptPath: promptResult.promptPath,
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

    if (deckData && deckData.deckText.trim()) {
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

    // Few-shot learning (format anchoring): same as non-stream for consistent quality
    if (userId && !isGuest) {
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

    if (tid) {
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

    sys += `\n\nFormatting: Use "Step 1", "Step 2" (with a space after Step). Put a space after colons. Keep step-by-step analysis concise; lead with actionable recommendations. Do NOT suggest cards that are already in the decklist.`;
    
    // Create OpenAI streaming request (model by user tier: guest/free/pro)
    const messages: any[] = [
      { role: "system", content: sys },
      { role: "user", content: text }
    ];
    
    const tokenLimit = MAX_TOKENS_STREAM;
    
    const openAIBody = prepareOpenAIBody({
      model: effectiveModel,
      messages,
      stream: true,
      max_completion_tokens: tokenLimit
    } as Record<string, unknown>);
    
    console.log("[stream] OpenAI request body:", JSON.stringify(openAIBody, null, 2));

    // Create readable stream with OpenAI streaming
    const encoder = new TextEncoder();
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let streamStartTime = Date.now();
    let estimatedTokens = 0;
    
    const stream = new ReadableStream({
      async start(controller) {
        let openAIResponse: Response | null = null;
        try {
          // Set up heartbeat
          heartbeatTimer = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(" "));
            } catch {
              if (heartbeatTimer) clearInterval(heartbeatTimer);
            }
          }, STREAM_HEARTBEAT_MS);

          // Start OpenAI streaming request
          openAIResponse = await fetch(OPENAI_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify(openAIBody)
          });

          if (!openAIResponse.ok) {
            // Log the actual error from OpenAI
            const errorText = await openAIResponse.text();
            console.log(`[stream] OpenAI API error ${openAIResponse.status}:`, errorText);
            
            // Try fallback model if primary model fails (effectiveModel is always chat-capable)
            const tryFallback = effectiveModel !== modelTierRes.fallbackModel;
            if (tryFallback) {
              const fallbackBody = prepareOpenAIBody({
                model: modelTierRes.fallbackModel,
                messages,
                max_completion_tokens: tokenLimit,
                stream: true
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
                throw new Error(`Both models failed - primary: ${errorText}, fallback: ${fallbackError}`);
              }
            } else {
              throw new Error(`OpenAI API error: ${openAIResponse.status} - ${errorText}`);
            }
          }

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
              user_id: userId,
              thread_id: tid || null,
              model: effectiveModel,
              input_tokens: it,
              output_tokens: ot,
              cost_usd: cost,
              route: "chat_stream",
              prompt_preview: typeof text === "string" ? text.slice(0, 1000) : null,
              response_preview: typeof outputText === "string" ? outputText.slice(0, 1000) : null,
              model_tier: modelTierRes.tier,
            });
          } catch (_) {}

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
