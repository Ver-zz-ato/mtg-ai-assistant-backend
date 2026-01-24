import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { prepareOpenAIBody } from "@/lib/ai/openai-params";

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

    const requestBody = prepareOpenAIBody({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert Magic: The Gathering deck analyst. Provide clear, actionable insights about deck comparisons."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: 1000,
    });

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMsg = errorBody?.error?.message || `HTTP ${response.status}`;
      throw new Error(errorMsg);
    }

    const json = await response.json().catch(() => ({}));
    const analysis = json?.choices?.[0]?.message?.content || "Unable to generate analysis.";

    return NextResponse.json({ ok: true, analysis });
  } catch (e: any) {
    console.error("AI comparison error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Failed to generate analysis" }, { status: 500 });
  }
}
