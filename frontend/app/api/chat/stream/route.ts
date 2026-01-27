import { NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { ChatPostSchema } from "@/lib/validate";
import type { SfCard } from "@/lib/deck/inference";
import { MAX_STREAM_SECONDS, MAX_TOKENS_STREAM, STREAM_HEARTBEAT_MS } from "@/lib/config/streaming";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";

export const runtime = "nodejs";

// Force streaming to use gpt-4o-mini to avoid org verification issues
const MODEL = "gpt-4o-mini";
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
  
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      isGuest = true;
    } else {
      userId = user.id;
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
          message: "Please sign in to continue chatting. You've reached the 10 message limit for guest users.",
          guestLimitReached: true
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Rate limiting for authenticated users
    if (!isGuest && userId) {
      // Check Pro status
      let isPro = false;
      try {
        const { checkProStatus } = await import('@/lib/server-pro-check');
        isPro = await checkProStatus(userId);
      } catch {}

      // Durable rate limiting (database-backed)
      const { checkDurableRateLimit } = await import('@/lib/api/durable-rate-limit');
      const { hashString } = await import('@/lib/guest-tracking');
      const userKeyHash = `user:${await hashString(userId)}`;
      
      const dailyLimit = isPro ? 500 : 50;
      const durableLimit = await checkDurableRateLimit(supabase, userKeyHash, '/api/chat/stream', dailyLimit, 1);
      
      if (!durableLimit.allowed) {
        return new Response(JSON.stringify({ 
          ok: false,
          code: "RATE_LIMIT_DAILY",
          fallback: true,
          reason: "durable_rate_limited",
          message: `You've reached your daily limit of ${dailyLimit} messages. ${isPro ? 'Contact support if you need higher limits.' : 'Upgrade to Pro for 500 messages/day!'}`,
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

    // Load prompt version from prompt_versions table (same as main chat route)
    // This ensures streaming uses the same patched prompt as regular chat
    // When you apply patches via /admin/ai-test, they update the active prompt version,
    // and this code loads that same version for all streaming chat requests.
    let sys = "";
    let promptVersionId: string | null = null;
    try {
      const { getPromptVersion } = await import("@/lib/config/prompts");
      const promptVersion = await getPromptVersion("chat");
      if (promptVersion) {
        sys = promptVersion.system_prompt;
        promptVersionId = promptVersion.id;
        if (process.env.NODE_ENV === "development") {
          console.log(`[chat/stream] ✅ Using prompt version ${promptVersion.version} (${promptVersion.id}) - Length: ${sys.length} chars`);
        }
      } else {
        // Fallback to default if no version found
        sys = "You are ManaTap AI, a concise, budget-aware Magic: The Gathering assistant. Answer succinctly with clear steps when advising.\n\nIMPORTANT: When mentioning Magic: The Gathering card names in your response, wrap them in double square brackets like [[Card Name]] so they can be displayed as images. For example: 'Consider adding [[Lightning Bolt]] and [[Sol Ring]] to your deck.' Always use this format for card names, even in lists or when using bold formatting.\n\nIf a rules question depends on board state, layers, or replacement effects, give the most likely outcome but remind the user to double-check the official Oracle text.";
        console.warn(`[chat/stream] ⚠️ No prompt version found, using default prompt`);
      }
    } catch (e) {
      console.warn("[chat/stream] Failed to load prompt version, using default:", e);
      // Fallback to default
      sys = "You are ManaTap AI, a concise, budget-aware Magic: The Gathering assistant. Answer succinctly with clear steps when advising.\n\nIMPORTANT: When mentioning Magic: The Gathering card names in your response, wrap them in double square brackets like [[Card Name]] so they can be displayed as images. For example: 'Consider adding [[Lightning Bolt]] and [[Sol Ring]] to your deck.' Always use this format for card names, even in lists or when using bold formatting.\n\nIf a rules question depends on board state, layers, or replacement effects, give the most likely outcome but remind the user to double-check the official Oracle text.";
    }
    
    // Add inference when deck is linked (lightweight for streaming)
    // Check both thread-linked deck and context.deckId (passed directly from DeckAssistant)
    const contextDeckId = typeof raw?.context === 'object' && raw.context !== null && 'deckId' in raw.context
      ? (raw.context as any).deckId
      : null;
    
    if ((tid && !isGuest) || contextDeckId) {
      try {
        // Check if thread is linked to a deck, or use context.deckId
        let deckIdLinked: string | null = null;
        if (tid && !isGuest) {
          const { data: th } = await supabase.from("chat_threads").select("deck_id").eq("id", tid).maybeSingle();
          deckIdLinked = th?.deck_id as string | null;
        }
        // Prefer context.deckId if provided (more direct)
        if (contextDeckId) {
          deckIdLinked = contextDeckId;
        }
        
        if (deckIdLinked) {
          try {
            const { data: d } = await supabase.from("decks").select("title, commander, format").eq("id", deckIdLinked).maybeSingle();
            const { data: allCards } = await supabase.from("deck_cards").select("name, qty").eq("deck_id", deckIdLinked).limit(400);
            
            let entries: Array<{ count: number; name: string }> = [];
            let deckText = "";
            
            if (allCards && Array.isArray(allCards) && allCards.length > 0) {
              entries = allCards.map((c: any) => ({ count: c.qty || 1, name: c.name }));
              deckText = entries.map(e => `${e.count} ${e.name}`).join("\n");
            }
            
            // Always add decklist to system prompt if we have it
            if (deckText && deckText.trim()) {
              const format = (d?.format || "Commander") as "Commander" | "Modern" | "Pioneer";
              const commander = d?.commander || null;
              
              // Try to infer context for better analysis, but don't fail if inference fails
              let inferredContext: any = { format, colors: [], commander };
              if (entries.length > 0) {
                try {
                  const { inferDeckContext, fetchCard } = await import("@/lib/deck/inference");
                  
                  // Build minimal card map (only fetch first 50 cards for speed)
                  const byName = new Map<string, SfCard>();
                  const unique = Array.from(new Set(entries.map(e => e.name))).slice(0, 50);
                  const looked = await Promise.all(unique.map(name => fetchCard(name)));
                  for (const c of looked) {
                    if (c) byName.set(c.name.toLowerCase(), c);
                  }
                  
                  // Infer deck context
                  inferredContext = await inferDeckContext(deckText, text, entries, format, commander, [], byName);
                } catch (error) {
                  console.warn("[stream] Failed to infer deck context:", error);
                  // Use basic info if inference fails
                  inferredContext = { format, colors: [], commander };
                }
              }
              
              // Add key inferred context to system prompt - make it explicit so AI doesn't assume format
              sys += `\n\nDECK CONTEXT (YOU ALREADY KNOW THIS - DO NOT ASK OR ASSUME):\n`;
              sys += `- Format: ${inferredContext.format} (this is the deck's format, do NOT say "Format unclear" or "I'll assume")\n`;
              sys += `- Colors: ${inferredContext.colors.join(', ') || 'none'}\n`;
              if (inferredContext.commander) {
                sys += `- Commander: ${inferredContext.commander}\n`;
              }
              sys += `- Deck Title: ${d?.title || 'Untitled Deck'}\n`;
              sys += `- Full Decklist:\n${deckText}\n`;
              sys += `- IMPORTANT: You already have the complete decklist above. Do NOT ask the user to "share the decklist" or "provide a decklist" - you already have it. The format, commander, color identity, and full decklist are all known. Do NOT include messages like "Format unclear — I'll assume Commander (EDH) for now" or "I'll need to see the decklist" - start directly with your analysis or suggestions.\n`;
              if (inferredContext.format !== "Commander") {
                sys += `- WARNING: Do NOT suggest Commander-only cards like Sol Ring, Command Tower, Arcane Signet.\n`;
                sys += `- Only suggest cards legal in ${inferredContext.format} format.\n`;
              }
              sys += `- Do NOT suggest cards already in the decklist above.\n`;
              sys += `- When describing card draw or hand effects, distinguish between card advantage (net gain of cards) and card filtering (same number of cards but improved quality). For example, Faithless Looting and Careful Study are filtering, not draw engines.\n`;
            }
          } catch (error) {
            console.warn("[stream] Failed to fetch deck for inference:", error);
          }
        }
        
        // Task 1: Extract pasted decklist from thread history (lightweight for streaming)
        const { data: messages } = await supabase
          .from("chat_messages")
          .select("role, content")
          .eq("thread_id", tid)
          .order("created_at", { ascending: true })
          .limit(30);
        
        if (messages && Array.isArray(messages) && messages.length > 0) {
          const { isDecklist } = await import("@/lib/chat/decklistDetector");
          const { analyzeDecklistFromText, generateDeckContext } = await import("@/lib/chat/enhancements");
          
          // Find most recent decklist (excluding current message if it's not a decklist)
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            // Skip the current message if it's not a decklist
            if (i === messages.length - 1 && msg.content === text && !isDecklist(msg.content)) {
              continue;
            }
            if (msg.role === 'user' && msg.content) {
              const isDeck = isDecklist(msg.content);
              if (isDeck) {
                const problems = analyzeDecklistFromText(msg.content);
                // Always include decklist context, even if no problems found
                const decklistContext = generateDeckContext(problems, 'Pasted Decklist', msg.content);
                if (decklistContext) {
                  sys += "\n\n" + decklistContext;
                  break;
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn("[stream] Failed to fetch conversation history:", error);
      }
    }
    
    // Create OpenAI streaming request
    const messages: any[] = [
      { role: "system", content: sys },
      { role: "user", content: text }
    ];
    
    // Use gpt-4o-mini for streaming (no verification required)
    const tokenLimit = Math.min(MAX_TOKENS_STREAM, 1000);
    
    const openAIBody = prepareOpenAIBody({
      model: MODEL,
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
            
            // Try fallback model if primary model fails
            const isGPT5Primary = MODEL.toLowerCase().includes('gpt-5');
            if (isGPT5Primary) {
              const fallbackBody = prepareOpenAIBody({
                model: "gpt-4o-mini",
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
                throw new Error(`Both models failed - GPT-5: ${errorText}, GPT-4o-mini: ${fallbackError}`);
              }
            } else {
              throw new Error(`OpenAI API error: ${openAIResponse.status} - ${errorText}`);
            }
          }

          const reader = openAIResponse.body?.getReader();
          if (!reader) throw new Error("No response stream");

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            // Check time and token limits
            const elapsed = Date.now() - streamStartTime;
            if (elapsed > MAX_STREAM_SECONDS * 1000) {
              controller.enqueue(encoder.encode("\n\nPaused to protect your token budget."));
              break;
            }
            if (estimatedTokens > MAX_TOKENS_STREAM) {
              controller.enqueue(encoder.encode("\n\nPaused to protect your token budget."));
              break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed === "data: [DONE]") {
                controller.enqueue(encoder.encode("\n[DONE]"));
                controller.close();
                return;
              }
              if (trimmed.startsWith("data: ")) {
                try {
                  const jsonStr = trimmed.slice(6);
                  if (jsonStr === "[DONE]") {
                    controller.enqueue(encoder.encode("\n[DONE]"));
                    controller.close();
                    return;
                  }
                  const data = JSON.parse(jsonStr);
                  const delta = data.choices?.[0]?.delta?.content;
                  if (delta) {
                    try {
                      controller.enqueue(encoder.encode(delta));
                      // Rough token estimation (4 chars ≈ 1 token)
                      estimatedTokens += Math.ceil(delta.length / 4);
                    } catch (controllerError) {
                      // Controller already closed, stop processing
                      if (DEV) console.log('[stream] Controller closed, stopping');
                      return;
                    }
                  }
                } catch (e) {
                  if (DEV) console.warn("[stream] parse error:", e, trimmed);
                }
              }
            }
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
