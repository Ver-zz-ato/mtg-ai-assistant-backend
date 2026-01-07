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
    const { batchResults, count = 5 } = body;

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
        testCases: [],
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OpenAI API key not configured" }, { status: 500 });
    }

    // Build prompt for generating new test cases
    const failureSummaries = failures.slice(0, 10).map((f: any, idx: number) => {
      const testCase = f.testCase;
      const response = f.result?.response?.text || "[EMPTY RESPONSE]";
      const validation = f.validation;
      const failedChecks = validation?.keywordResults?.checks?.filter((c: any) => !c.passed) || [];

      return `
Test ${idx + 1}: ${testCase.name}
- Type: ${testCase.type}
- User Message: ${testCase.input.userMessage}
- Expected: ${JSON.stringify(testCase.expectedChecks)}
- Actual Response: ${response.slice(0, 300)}
- Failed Checks: ${failedChecks.map((c: any) => c.message).join("; ")}
`;
    });

    const systemPrompt = `You are a test case generation expert for a Magic: The Gathering AI assistant. Analyze failed test cases and generate NEW test cases that would catch similar failure patterns.

Return JSON with:
{
  "testCases": [
    {
      "name": "Descriptive test name",
      "type": "chat" or "deck_analysis",
      "input": {
        "userMessage": "User's question or input",
        "format": "Commander" (or other format),
        "deckText": "decklist" (if deck_analysis),
        "commander": "Commander name" (if applicable),
        "colors": ["R", "G"] (if applicable)
      },
      "expectedChecks": {
        "shouldContain": ["keyword1", "keyword2"],
        "shouldNotContain": ["bad_keyword"],
        "minLength": 100,
        "shouldMentionCard": ["Card Name"]
      },
      "tags": ["tag1", "tag2", "category"]
    }
  ]
}

Generate ${count} diverse test cases that would catch similar issues to the failures shown.`;

    const userPrompt = `Analyze these test failures and generate new test cases that would catch similar issues:\n\n${failureSummaries.join("\n")}`;

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
          max_tokens: 2000,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        throw new Error(`LLM generation failed: ${res.status}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("No content from LLM generation");
      }

      const generated = JSON.parse(content);

      // Create test cases in database
      const createdCases: any[] = [];
      if (Array.isArray(generated.testCases)) {
        for (const testCase of generated.testCases) {
          try {
            const { data: created, error: createError } = await supabase
              .from("ai_test_cases")
              .insert({
                name: testCase.name,
                type: testCase.type || "chat",
                input: testCase.input,
                expected_checks: testCase.expectedChecks || {},
                tags: testCase.tags || ["generated"],
                source: "generated-from-failures",
              })
              .select("id, name")
              .single();

            if (!createError && created) {
              createdCases.push(created);
            } else {
              console.error(`[generate-from-failures] Failed to create test case:`, createError);
            }
          } catch (insertError: any) {
            console.error(`[generate-from-failures] Exception creating test case:`, insertError);
          }
        }
      }

      return NextResponse.json({
        ok: true,
        testCases: createdCases,
        generated: generated.testCases || [],
        message: `Generated ${createdCases.length} new test cases from failures`,
      });
    } catch (error: any) {
      return NextResponse.json({
        ok: false,
        error: `Generation failed: ${error.message}`,
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || "server_error" }, { status: 500 });
  }
}



