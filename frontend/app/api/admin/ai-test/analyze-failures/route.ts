import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";

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

    // Get current prompt to check what behaviors already exist
    const { getPromptVersion } = await import("@/lib/config/prompts");
    const firstType = failures[0]?.testCase?.type || "chat";
    const promptKind = firstType === "deck_analysis" ? "deck_analysis" : "chat";
    const currentPrompt = await getPromptVersion(promptKind);
    const currentPromptText = currentPrompt?.system_prompt || "";

    const systemPrompt = `You are a prompt engineering expert for a Magic: The Gathering AI assistant. Analyze test failures and suggest specific, actionable improvements to the system prompt.

IMPORTANT: Before suggesting any improvement, check if the behavior is ALREADY in the current prompt. Do NOT suggest:
- "Add synergy language" if the prompt already mentions synergy, "works well with", "combos with", etc.
- "Add archetype identification" if the prompt already mentions identifying deck style/archetype
- "Add problems-first structure" if the prompt already mentions listing problems before solutions
- "Add budget awareness" if the prompt already mentions budget language
- "Add tone matching" if the prompt already mentions casual vs competitive tone
- "Add specificity" if the prompt already emphasizes concrete card suggestions
- Generic improvements that are already covered

Only suggest improvements for behaviors that are GENUINELY missing from the current prompt.

Current prompt (for reference - check what's already there):
${currentPromptText.slice(0, 2000)}${currentPromptText.length > 2000 ? "\n[... truncated ...]" : ""}

Return JSON with:
{
  "summary": "Brief overview of common failure patterns (only for genuinely missing behaviors)",
  "suggestions": [
    {
      "priority": "high|medium|low",
      "category": "ramp|color-identity|archetype|format|tone|etc",
      "issue": "What's wrong (only if behavior is missing from prompt)",
      "currentBehavior": "What the AI is doing wrong",
      "suggestedPromptAddition": "Exact text to add to the system prompt (ONLY if not already present)",
      "rationale": "Why this will help (and why it's not already covered)",
      "affectedTests": ["test-id-1", "test-id-2"],
      "alreadyInPrompt": false
    }
  ]
}`;

    const userPrompt = `Analyze these test failures and suggest prompt improvements:\n\n${failureSummaries.join("\n")}`;

    try {
      const requestBody = prepareOpenAIBody({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
      } as Record<string, unknown>);

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
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

      // Filter out suggestions that are already in the prompt
      const promptLower = currentPromptText.toLowerCase();
      const alreadyCoveredKeywords = [
        "synergy", "works well with", "combos with", "pairs with",
        "archetype", "deck style", "identify", "restate plan",
        "problems", "issues", "weaknesses", "before solutions",
        "budget", "affordable", "cheaper", "budget-friendly",
        "casual", "competitive", "tone", "power level",
        "concrete", "specific", "card names", "card suggestions"
      ];

      // Track filtered suggestions for observability
      const filteredSuggestionsSample: Array<{ issue: string; reason: string; text: string }> = [];
      const maxSampleSize = 5;
      
      const filteredSuggestions = Array.isArray(analysis.suggestions) 
        ? analysis.suggestions.filter((s: any) => {
            // Skip if marked as already in prompt
            if (s.alreadyInPrompt === true) {
              if (filteredSuggestionsSample.length < maxSampleSize) {
                filteredSuggestionsSample.push({
                  issue: s.issue || "Unknown",
                  reason: "alreadyInPrompt",
                  text: (s.suggestedPromptAddition || "").slice(0, 200), // Trim for safety
                });
              }
              return false;
            }
            
            // Check if the suggestion category is already covered
            const suggestionText = (s.suggestedPromptAddition || "").toLowerCase();
            const issueText = (s.issue || "").toLowerCase();
            
            // Check for overlap with existing prompt content
            const hasOverlap = alreadyCoveredKeywords.some(keyword => {
              const inPrompt = promptLower.includes(keyword);
              const inSuggestion = suggestionText.includes(keyword) || issueText.includes(keyword);
              return inPrompt && inSuggestion;
            });
            
            // Also check if the exact suggestion text is similar to existing prompt
            let hasHighOverlap = false;
            if (suggestionText.length > 20) {
              const words = suggestionText.split(/\s+/).filter((w: string) => w.length > 4);
              const matchingWords = words.filter((w: string) => promptLower.includes(w));
              if (matchingWords.length > words.length * 0.5) {
                hasHighOverlap = true;
              }
            }
            
            if (hasOverlap || hasHighOverlap) {
              if (filteredSuggestionsSample.length < maxSampleSize) {
                filteredSuggestionsSample.push({
                  issue: s.issue || "Unknown",
                  reason: hasHighOverlap ? "highOverlap" : "keywordOverlap",
                  text: (s.suggestedPromptAddition || "").slice(0, 200), // Trim for safety
                });
              }
              return false;
            }
            
            return true;
          })
        : [];

      // Create prompt_patches rows for each filtered suggestion
      const patchIds: string[] = [];
      if (filteredSuggestions.length > 0) {
        for (const suggestion of filteredSuggestions) {
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
                // Return filtered suggestions anyway so user can see them
                const originalCount = Array.isArray(analysis.suggestions) ? analysis.suggestions.length : 0;
                const filteredCount = filteredSuggestions.length;
                const skippedCount = originalCount - filteredCount;
                return NextResponse.json({
                  ok: true,
                  analysis: {
                    summary: analysis.summary || "Analysis complete",
                    suggestions: filteredSuggestions,
                    originalSuggestionCount: originalCount,
                    filteredSuggestionCount: filteredCount,
                    skippedCount: skippedCount,
                    filteredSuggestionsSample: filteredSuggestionsSample.length > 0 ? filteredSuggestionsSample : undefined,
                  },
                  patches: [],
                  message: `Analysis complete but prompt_patches table not found. ${filteredCount} suggestions generated (${skippedCount} skipped - already in prompt).`,
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

      const originalCount = Array.isArray(analysis.suggestions) ? analysis.suggestions.length : 0;
      const filteredCount = filteredSuggestions.length;
      const skippedCount = originalCount - filteredCount;

      return NextResponse.json({
        ok: true,
        analysis: {
          summary: analysis.summary || "Analysis complete",
          suggestions: filteredSuggestions,
          originalSuggestionCount: originalCount,
          filteredSuggestionCount: filteredCount,
          skippedCount: skippedCount,
          skippedReason: skippedCount > 0 ? "Some suggestions were already covered in the current prompt" : undefined,
          filteredSuggestionsSample: filteredSuggestionsSample.length > 0 ? filteredSuggestionsSample : undefined, // Debug: sample of filtered suggestions
        },
        patches: patchIds,
        message: `Created ${patchIds.length} prompt patches${skippedCount > 0 ? ` (${skippedCount} skipped - already in prompt)` : ""}`,
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

