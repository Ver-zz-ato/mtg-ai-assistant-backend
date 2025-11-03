import { NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { ChatPostSchema } from "@/lib/validate";
import { MAX_STREAM_SECONDS, MAX_TOKENS_STREAM, STREAM_HEARTBEAT_MS } from "@/lib/config/streaming";

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
  
  console.log("[stream] POST request received at", new Date().toISOString());
  
  try {
    console.log("[stream] Getting supabase client...");
    const supabase = await getServerSupabase();
    
    console.log("[stream] Getting user authentication...");
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log("[stream] No user found, allowing guest access");
      isGuest = true;
    } else {
      userId = user.id;
      console.log("[stream] Authenticated user:", userId);
    }
    
    console.log("[stream] Parsing request body...");

    // Accept { text } and legacy { prompt }
    const raw = await req.json().catch(() => ({}));
    console.log("[stream] Request body:", raw);
    
    const inputText = typeof raw?.prompt === "string" ? raw.prompt : raw?.text;
    console.log("[stream] Input text:", inputText);
    
    const normalized = { text: inputText, threadId: raw?.threadId };
    const parse = ChatPostSchema.safeParse(normalized);
    
    if (!parse.success) { 
      status = 400;
      console.log("[stream] Validation failed:", parse.error);
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

    console.log("[stream] Validation passed, text:", text.substring(0, 50) + '...');
    
    // Save user message to database (if thread exists and user is logged in)
    let tid = threadId ?? null;
    if (tid && !isGuest && userId) {
      try {
        await supabase.from("chat_messages")
          .insert({ thread_id: tid, role: "user", content: text });
      } catch (error) {
        console.warn("[stream] Failed to save user message:", error);
      }
    }
    
    // Check if OpenAI API key exists
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log("[stream] No OpenAI API key found");
      return new Response(JSON.stringify({ 
        fallback: true,
        reason: "missing_api_key",
        message: "OpenAI API key not configured" 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    console.log("[stream] OpenAI API key found");

    // Guest user limit checking
    if (isGuest) {
      const guestMessageCount = parseInt(raw?.guestMessageCount || '0', 10);
      const GUEST_MESSAGE_LIMIT = 50;
      
      console.log("[stream] Guest user, message count:", guestMessageCount);
      
      if (guestMessageCount >= GUEST_MESSAGE_LIMIT) {
        console.log("[stream] Guest user exceeded message limit");
        return new Response(JSON.stringify({
          fallback: true,
          reason: "guest_limit_exceeded",
          message: "Please sign in to continue chatting. You've reached the 20 message limit for guest users.",
          guestLimitReached: true
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Rate limiting (skip for guest users)
    if (!isGuest) {
      const rl = await checkRateLimit(supabase as any, userId!);
      if (!rl.ok) {
        return new Response(JSON.stringify({ fallback: true }), {
          status: 429,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Build system prompt (simplified from main chat route)
    let sys = "You are ManaTap AI, a concise, budget-aware Magic: The Gathering assistant. Answer succinctly with clear steps when advising.";
    
    // Task 1: Extract pasted decklist from thread history (lightweight for streaming)
    if (threadId && !isGuest) {
      try {
        const { data: messages } = await supabase
          .from("chat_messages")
          .select("role, content")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: false })
          .limit(20); // Smaller limit for streaming
        
        if (messages && Array.isArray(messages)) {
          const { isDecklist } = await import("@/lib/chat/decklistDetector");
          const { analyzeDecklistFromText, generateDeckContext } = await import("@/lib/chat/enhancements");
          
          // Find most recent decklist
          for (const msg of messages) {
            if (msg.role === 'user' && isDecklist(msg.content)) {
              const problems = analyzeDecklistFromText(msg.content);
              if (problems.length > 0) {
                const decklistContext = generateDeckContext(problems, 'Pasted Decklist');
                sys += "\n\n" + decklistContext;
                break;
              }
            }
          }
        }
      } catch (error) {
        // Silently fail - optional enhancement
      }
    }
    
    // Create OpenAI streaming request
    const messages: any[] = [
      { role: "system", content: sys },
      { role: "user", content: text }
    ];
    
    // Use gpt-4o-mini for streaming (no verification required)
    const tokenLimit = Math.min(MAX_TOKENS_STREAM, 1000);
    
    const openAIBody = {
      model: MODEL,
      messages,
      temperature: 1,
      stream: true,
      max_tokens: tokenLimit // gpt-4o-mini uses max_tokens
    };
    
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
              console.log(`[stream] GPT-5 failed, trying GPT-4o-mini fallback`);
              const fallbackBody = {
                model: "gpt-4o-mini",
                messages,
                max_tokens: tokenLimit, // GPT-4o-mini uses max_tokens
                temperature: 1,
                stream: true
              };
              
              console.log(`[stream] Fallback request:`, JSON.stringify(fallbackBody, null, 2));
              const fallbackResponse = await fetch(OPENAI_URL, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify(fallbackBody)
              });
              
              if (fallbackResponse.ok) {
                console.log(`[stream] Fallback to GPT-4o-mini succeeded`);
                openAIResponse = fallbackResponse;
              } else {
                const fallbackError = await fallbackResponse.text();
                console.log(`[stream] Fallback also failed:`, fallbackError);
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
