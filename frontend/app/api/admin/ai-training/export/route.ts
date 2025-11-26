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

/**
 * GET /api/admin/ai-training/export
 * Export training-worthy test results as JSONL for fine-tuning
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    // Query training-worthy results: passed validation AND (judge score >= 85 OR manual approval)
    const { data: results, error: resultsError } = await supabase
      .from("ai_test_results")
      .select(`
        *,
        ai_test_cases(*),
        prompt_versions(version)
      `)
      .eq("validation_results->>passed", "true")
      .or("validation_results->judge->>overall_score.gte.85,manual_review_status.eq.approved");

    if (resultsError) {
      return NextResponse.json({ ok: false, error: resultsError.message }, { status: 500 });
    }

    if (results.length === 0) {
      return NextResponse.json({ ok: false, error: "No training-worthy results found" }, { status: 404 });
    }

    // Build training examples
    const trainingExamples: any[] = [];

    for (const result of results) {
      const testCase = result.ai_test_cases;
      const promptVersion = result.prompt_versions;
      const validation = result.validation_results;

      if (!testCase) continue;

      // Build input based on test type
      const input: any = {
        kind: testCase.type,
        prompt_version: promptVersion?.version || "unknown",
      };

      if (testCase.type === "chat") {
        input.userMessage = testCase.input?.userMessage || "";
        if (testCase.input?.context) {
          input.context = testCase.input.context;
        }
      } else if (testCase.type === "deck_analysis") {
        input.deckText = testCase.input?.deckText || "";
        input.format = testCase.input?.format || "";
        input.commander = testCase.input?.commander || "";
        if (testCase.input?.plan) input.plan = testCase.input.plan;
        if (testCase.input?.budget) input.budget = testCase.input.budget;
        if (testCase.input?.constraints) input.constraints = testCase.input.constraints;
      }

      // Derive instruction from test type
      let instruction = "";
      if (testCase.type === "chat") {
        instruction = "Answer the user's Magic: The Gathering question accurately and helpfully.";
      } else if (testCase.type === "deck_analysis") {
        instruction = "Analyze this deck and provide constructive suggestions for improvement.";
      }

      // Use improved_answer if available, otherwise response_text
      const output = validation?.judge?.improved_answer || result.response_text || "";

      if (!output || output.trim().length === 0) continue;

      const example = {
        input,
        instruction,
        output,
        meta: {
          test_case_id: testCase.id,
          ai_test_result_id: result.id,
          judge_scores: validation?.judge || undefined,
        },
      };

      trainingExamples.push(example);
    }

    if (trainingExamples.length === 0) {
      return NextResponse.json({ ok: false, error: "No valid training examples after filtering" }, { status: 404 });
    }

    // Convert to JSONL format (one JSON object per line)
    const jsonl = trainingExamples.map((ex) => JSON.stringify(ex)).join("\n");

    // Return as downloadable file
    return new NextResponse(jsonl, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="mtg-ai-training-${new Date().toISOString().slice(0, 10)}.jsonl"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

