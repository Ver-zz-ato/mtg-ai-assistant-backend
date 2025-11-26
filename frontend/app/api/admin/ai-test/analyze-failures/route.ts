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
        patches: [],
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
      const judge = validation?.llmJudge;

      return `
Test ${idx + 1}: ${testCase.name}
- Type: ${testCase.type}
- User Message: ${testCase.input.userMessage}
- Expected: ${JSON.stringify(testCase.expectedChecks)}
- Actual Response: ${response.slice(0, 500)}
- Failed Checks: ${failedChecks.map((c: any) => c.message).join("; ")}
${judge ? `- Judge Scores: Factual ${judge.factual_score}, Legality ${judge.legality_score}, Synergy ${judge.synergy_score}, Pedagogy ${judge.pedagogy_score}` : ""}
${judge?.issues?.length ? `- Judge Issues: ${judge.issues.join("; ")}` : ""}
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
      "suggestedPromptAddition": "Exact text to add to the system prompt",
      "rationale": "Why this will help",
      "affectedTests": ["test-id-1", "test-id-2"]
    }
  ]
}`;

    const userPrompt = `Analyze these test failures and suggest prompt improvements:\n\n${failureSummaries.join("\n")}`;

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
          temperature: 0.3,
          max_tokens: 2000,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        throw new Error(`LLM analysis failed: ${res.status}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("No content from LLM analysis");
      }

      const analysis = JSON.parse(content);

      // Create prompt_patches rows for each suggestion
      const patchIds: string[] = [];
      if (Array.isArray(analysis.suggestions)) {
        for (const suggestion of analysis.suggestions) {
          try {
            const { data: patch, error: patchError } = await supabase
              .from("prompt_patches")
              .insert({
                source: "ai-test.analyze-failures",
                category: suggestion.category || "general",
                priority: suggestion.priority || "medium",
                suggested_text: suggestion.suggestedPromptAddition || "",
                rationale: suggestion.rationale || "",
                affected_tests: suggestion.affectedTests || [],
                status: "pending",
              })
              .select("id")
              .single();

            if (patchError) {
              console.error(`[analyze-failures] Failed to create patch:`, patchError);
              // If table doesn't exist, continue but log warning
              if (patchError.message?.includes("does not exist") || patchError.code === "42P01" || patchError.code === "PGRST116") {
                console.warn("[analyze-failures] prompt_patches table does not exist. Please create it first.");
                // Return suggestions anyway so user can see them
                return NextResponse.json({
                  ok: true,
                  analysis: {
                    summary: analysis.summary || "Analysis complete",
                    suggestions: analysis.suggestions || [],
                  },
                  patches: [],
                  message: `Analysis complete but prompt_patches table not found. ${analysis.suggestions?.length || 0} suggestions generated.`,
                  warning: "prompt_patches table does not exist. Suggestions are available but cannot be saved as patches.",
                });
              }
            } else if (patch) {
              patchIds.push(patch.id);
            }
          } catch (insertError: any) {
            console.error(`[analyze-failures] Exception creating patch:`, insertError);
          }
        }
      }

      return NextResponse.json({
        ok: true,
        analysis: {
          summary: analysis.summary || "Analysis complete",
          suggestions: analysis.suggestions || [],
        },
        patches: patchIds,
        message: `Created ${patchIds.length} prompt patches`,
      });
    } catch (error: any) {
      return NextResponse.json({
        ok: false,
        error: `Analysis failed: ${error.message}`,
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || "server_error" }, { status: 500 });
  }
}
