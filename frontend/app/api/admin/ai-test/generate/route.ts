import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { description, count = 5, type = "chat" } = body;

    if (!description) {
      return NextResponse.json({ ok: false, error: "description required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OpenAI API key not configured" }, { status: 500 });
    }

    // Use LLM to generate test cases
    const systemPrompt = `You are a test case generator for a Magic: The Gathering AI assistant. Generate test cases based on the user's description.

Return a JSON array of test cases. Each test case should have:
- name: A descriptive name
- type: "chat" or "deck_analysis"
- input: { userMessage, format?, deckText?, commander?, colors?, context? }
- expectedChecks: { shouldContain?, shouldNotContain?, shouldMentionCard?, shouldNotMentionCard?, minLength?, formatSpecific? }
- tags: Array of relevant tags (e.g., ["ramp", "commander", "budget"])

Generate ${count} test cases.`;

    const userPrompt = `Generate test cases for: ${description}\n\nType: ${type}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { ok: false, error: errorData.error?.message || "LLM generation failed" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ ok: false, error: "No content from LLM" }, { status: 500 });
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      return NextResponse.json({ ok: false, error: "Invalid JSON from LLM" }, { status: 500 });
    }

    // Extract test cases (handle both { testCases: [...] } and [...] formats)
    const testCases = Array.isArray(parsed) ? parsed : parsed.testCases || parsed.cases || [];

    return NextResponse.json({
      ok: true,
      testCases: testCases.map((tc: any, idx: number) => ({
        id: `generated-${Date.now()}-${idx}`,
        name: tc.name || `Generated test ${idx + 1}`,
        type: tc.type || type,
        input: tc.input || {},
        expectedChecks: tc.expectedChecks || {},
        tags: tc.tags || ["llm_generated"],
        source: "llm_generated",
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

