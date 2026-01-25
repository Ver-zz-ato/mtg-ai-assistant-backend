import { NextRequest, NextResponse } from "next/server";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { createClient } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";
import { hashString } from "@/lib/guest-tracking";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export async function GET(req: NextRequest) {
  // Admin-only access check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }

  // Minimal global rate limit (10/min) as secondary protection
  const globalKeyHash = await hashString("debug-llm-global");
  const rateLimit = await checkDurableRateLimit(supabase, globalKeyHash, '/api/chat/debug/llm', 10, 1/1440); // 1 minute = 1/1440 days
  
  if (!rateLimit.allowed) {
    return NextResponse.json({ 
      ok: false,
      code: "RATE_LIMIT_PER_MINUTE",
      error: "Rate limit exceeded. Please slow down (10 requests per minute limit).",
      resetAt: rateLimit.resetAt
    }, { status: 429 });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    return NextResponse.json({ ok: true, provider: "fallback", reason: "no_api_key", model }, { status: 200 });
  }
  
  try {
    const { callLLM } = await import('@/lib/ai/unified-llm-client');
    
    const response = await callLLM(
      [{ role: "user", content: "ping" }],
      {
        route: '/api/chat/debug/llm',
        feature: 'debug_ping',
        model,
        timeout: 10000,
        maxTokens: 32,
        apiType: 'chat',
        userId: user.id,
        isPro: false, // Debug endpoint doesn't need Pro status
      }
    );

    return NextResponse.json({ ok: true, provider: "openai", model: response.actualModel, sample: "pong", fallback: response.fallback }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: true, provider: "fallback", reason: e?.message || "exception", model }, { status: 200 });
  }
}
