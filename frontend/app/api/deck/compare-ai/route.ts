import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { DECK_COMPARE_PRO } from "@/lib/feature-limits";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Check Pro status - AI deck comparison is Pro-only
    const { checkProStatus } = await import('@/lib/server-pro-check');
    const isPro = await checkProStatus(user.id);
    
    if (!isPro) {
      return NextResponse.json({ 
        ok: false, 
        error: "AI deck comparison is a Pro feature. Upgrade to unlock AI-powered deck analysis!" 
      }, { status: 403 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OpenAI API key not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { decks, comparison } = body;

    if (!decks || !comparison) {
      return NextResponse.json({ ok: false, error: "Missing decks or comparison data" }, { status: 400 });
    }

    // Build prompt for AI analysis
    const prompt = `You are an expert Magic: The Gathering deck analyst. Analyze the following deck comparison and provide insights.

DECKS BEING COMPARED:
${decks}

COMPARISON DATA:
- Shared cards across all decks: ${comparison.sharedCards?.length || 0} cards
- Unique cards per deck: ${comparison.uniqueToDecks?.map((d: any, i: number) => `Deck ${i + 1}: ${d.cards?.length || 0} unique cards`).join(', ') || 'N/A'}

Please provide a comprehensive analysis covering:
1. Key differences between the decks
2. Synergy and strategy comparison
3. Strengths and weaknesses of each deck
4. Recommendations for improvements
5. Which deck might be stronger in different scenarios

Keep the analysis concise but insightful (300-500 words). Format with clear sections.`;

    const { checkDurableRateLimit } = await import('@/lib/api/durable-rate-limit');
    const { hashString } = await import('@/lib/guest-tracking');
    const userKeyHash = `user:${await hashString(user.id)}`;
    const rateLimit = await checkDurableRateLimit(supabase, userKeyHash, '/api/deck/compare-ai', DECK_COMPARE_PRO, 1);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        ok: false,
        code: 'RATE_LIMIT_DAILY',
        error: "You've reached your daily limit. Contact support if you need higher limits.",
        resetAt: rateLimit.resetAt
      }, { status: 429 });
    }

    try {
      const { callLLM } = await import('@/lib/ai/unified-llm-client');
      const { getModelForTier } = await import('@/lib/ai/model-by-tier');
      const tierRes = getModelForTier({ isGuest: false, userId: user.id, isPro: true });
      
      const response = await callLLM(
        [
          {
            role: "system",
            content: "You are an expert Magic: The Gathering deck analyst. Provide clear, actionable insights about deck comparisons."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        {
          route: '/api/deck/compare-ai',
          feature: 'deck_compare',
          model: tierRes.model,
          fallbackModel: tierRes.fallbackModel,
          timeout: 300000,
          maxTokens: 1000,
          apiType: 'chat',
          userId: user.id,
          isPro: true,
        }
      );

      const analysis = response.text || "Unable to generate analysis.";

      return NextResponse.json({ ok: true, analysis });
    } catch (e: any) {
      console.error("AI comparison error:", e);
      return NextResponse.json({ ok: false, error: e?.message || "Failed to generate analysis" }, { status: 500 });
    }
  } catch (e: any) {
    console.error("Compare AI route error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
