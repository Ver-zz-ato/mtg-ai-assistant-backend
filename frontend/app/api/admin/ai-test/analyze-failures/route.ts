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
    const { batchResults } = body;

    if (!Array.isArray(batchResults)) {
      return NextResponse.json({ ok: false, error: "batchResults array required" }, { status: 400 });
    }

    // Filter to only failed tests
    const failures = batchResults.filter(
      (r: any) =>
        r.validation?.overall?.passed === false ||
        (r.result?.response?.text === "" && r.testCase.expectedChecks)
    );

    if (failures.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No failures to analyze! All tests passed.",
        suggestions: [],
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OpenAI API key not configured" }, { status: 500 });
    }

    // Build analysis prompt
    const failureSummaries = failures.map((f: any, idx: number) => {
      const testCase = f.testCase;
      const response = f.result?.response?.text || "[EMPTY RESPONSE]";
      const validation = f.validation;
      const failedChecks = validation?.keywordResults?.checks?.filter((c: any) => !c.passed) || [];

      return `
Test ${idx + 1}: ${testCase.name}
- Type: ${testCase.type}
- User Message: ${testCase.input.userMessage}
- Expected: ${JSON.stringify(testCase.expectedChecks)}
- Actual Response: ${response}
- Failed Checks: ${failedChecks.map((c: any) => c.message).join("; ")}
`;
    });

    const systemPrompt = `You are a prompt engineering expert for a Magic: The Gathering AI assistant. Analyze test failures and suggest specific, actionable improvements to the system prompt.

Return JSON with:
{
  "summary": "Brief overview of common failure patterns",
  "suggestions": [
    {
      "priority": "high|medium|low",
      "category": "ramp|color-identity|archetype|format|tone|etc",
      "issue": "What's wrong",
      "currentBehavior": "What the AI is doing wrong",
      "suggestedPromptAddition": "Exact text to add to system prompt",
      "affectedTests": ["test name 1", "test name 2"],
      "rationale": "Why this fix will help"
    }
  ]
}`;

    const userPrompt = `Analyze these ${failures.length} test failures and suggest prompt improvements:

${failureSummaries.join("\n---\n")}

Focus on:
1. Why responses are empty (if applicable)
2. Why expected keywords/cards aren't mentioned
3. Why format-specific guidance isn't followed
4. Why commander archetypes aren't respected

Provide specific, copy-paste-ready prompt additions that will fix these issues.`;

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
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { ok: false, error: errorData.error?.message || "LLM analysis failed" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ ok: false, error: "No content from LLM" }, { status: 500 });
    }

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch (e) {
      return NextResponse.json({ ok: false, error: "Invalid JSON from LLM" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      failureCount: failures.length,
      analysis,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}


