import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getPromptVersion, setActivePromptVersion } from "@/lib/config/prompts";
import { validateResponse } from "@/lib/ai/test-validator";
import { runPairwiseJudge, fallbackJudgeResult } from "@/lib/ai/pairwise-judge";

export const runtime = "nodejs";

type JudgeMode = "all" | "close_calls" | "sample";

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

    const { checkMaintenance } = await import("@/lib/maintenance-check");
    const maint = await checkMaintenance();
    if (maint.enabled) {
      return NextResponse.json({ ok: false, error: maint.message }, { status: 503 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      test_case_ids,
      prompt_version_id_a,
      prompt_version_id_b,
      validation_options,
      judge_options,
      judge_model,
      rubric_version = "rubric_v1",
      judge_mode = "all" as JudgeMode,
      close_call_threshold = 5,
      sample_rate = 0.3,
    } = body;

    let testCases: any[] = [];
    if (Array.isArray(test_case_ids) && test_case_ids.length > 0) {
      const { data, error } = await supabase.from("ai_test_cases").select("*").in("id", test_case_ids);
      if (error || !data?.length) {
        return NextResponse.json({ ok: false, error: "No test cases found" }, { status: 400 });
      }
      testCases = data.map((tc: any) => ({
        id: tc.id,
        name: tc.name,
        type: tc.type,
        input: tc.input,
        expectedChecks: tc.expected_checks,
        tags: tc.tags || [],
      }));
    } else {
      const { data, error } = await supabase.from("ai_test_cases").select("*").limit(20);
      if (error || !data?.length) {
        return NextResponse.json({ ok: false, error: "No test cases found" }, { status: 400 });
      }
      testCases = data.map((tc: any) => ({
        id: tc.id,
        name: tc.name,
        type: tc.type,
        input: tc.input,
        expectedChecks: tc.expected_checks,
        tags: tc.tags || [],
      }));
    }

    const promptKind = testCases[0]?.type === "deck_analysis" ? "deck_analysis" : "chat";
    const currentPrompt = await getPromptVersion(promptKind);
    const promptA = prompt_version_id_a || currentPrompt?.id;
    const promptB = prompt_version_id_b || promptA;

    if (!promptA || !promptB) {
      return NextResponse.json({ ok: false, error: "Could not resolve prompt versions" }, { status: 400 });
    }

    const usePromptOverride = promptA !== promptB;

    const suiteName = `pairwise-${promptA}-vs-${promptB}-${Date.now()}`;
    const { data: evalRun, error: evalError } = await supabase
      .from("eval_runs")
      .insert({
        suite: suiteName,
        prompts: [promptA, promptB],
        status: "running",
        meta: { pairwise: true, prompt_a: promptA, prompt_b: promptB },
      })
      .select("id")
      .single();

    if (evalError || !evalRun) {
      return NextResponse.json({ ok: false, error: "Failed to create eval_run" }, { status: 500 });
    }

    const apiKey = process.env.OPENAI_API_KEY || "";
    const baseUrl = req.url.split("/api/admin")[0];
    const validationOpts = { runKeywordChecks: true, runLLMFactCheck: validation_options?.runLLMFactCheck === true, runReferenceCompare: true, runAdvancedJudges: true, apiKey, supabase };

    const results: any[] = [];
    let batchTestThreadId: string | null = null;
    const restoreActive = usePromptOverride && currentPrompt
      ? () => setActivePromptVersion(promptKind, currentPrompt.id, currentPrompt.version)
      : () => {};
    const { data: existingThread } = await supabase.from("chat_threads").select("id").eq("user_id", user.id).eq("title", "Batch Test Thread").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existingThread) batchTestThreadId = existingThread.id;

    try {
    for (const tc of testCases) {
      let responseA = "";
      let responseB = "";

      try {
        if (tc.type === "chat") {
          if (usePromptOverride) await setActivePromptVersion(promptKind, promptA);
          const resA = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") || "" },
            body: JSON.stringify({ text: tc.input.userMessage, threadId: batchTestThreadId, noUserInsert: true, forceModel: process.env.MODEL_AI_TEST || "gpt-4o-mini", eval_run_id: evalRun.id }),
          });
          const dataA = await resA.json();
          responseA = dataA.text || "";

          if (usePromptOverride) await setActivePromptVersion(promptKind, promptB);
          const resB = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") || "" },
            body: JSON.stringify({ text: tc.input.userMessage, threadId: batchTestThreadId, noUserInsert: true, forceModel: process.env.MODEL_AI_TEST || "gpt-4o-mini", eval_run_id: evalRun.id }),
          });
          const dataB = await resB.json();
          responseB = dataB.text || "";
        } else {
          if (usePromptOverride) await setActivePromptVersion(promptKind, promptA);
          const resA = await fetch(`${baseUrl}/api/deck/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") || "" },
            body: JSON.stringify({
              deckText: tc.input.deckText || "",
              userMessage: tc.input.userMessage,
              format: tc.input.format || "Commander",
              commander: tc.input.commander,
              colors: tc.input.colors || [],
              forceModel: process.env.MODEL_AI_TEST || "gpt-4o-mini",
              eval_run_id: evalRun.id,
            }),
          });
          const dataA = await resA.json();
          responseA = [
            ...(dataA.whatsGood || []).map((m: string) => `✅ ${m}`),
            ...(dataA.quickFixes || []).map((m: string) => `⚠️ ${m}`),
            ...(dataA.suggestions || []).map((s: any) => `💡 ${s.card}: ${s.reason || ""}`),
          ].join("\n");

          if (usePromptOverride) await setActivePromptVersion(promptKind, promptB);
          const resB = await fetch(`${baseUrl}/api/deck/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") || "" },
            body: JSON.stringify({
              deckText: tc.input.deckText || "",
              userMessage: tc.input.userMessage,
              format: tc.input.format || "Commander",
              commander: tc.input.commander,
              colors: tc.input.colors || [],
              forceModel: process.env.MODEL_AI_TEST || "gpt-4o-mini",
              eval_run_id: evalRun.id,
            }),
          });
          const dataB = await resB.json();
          responseB = [
            ...(dataB.whatsGood || []).map((m: string) => `✅ ${m}`),
            ...(dataB.quickFixes || []).map((m: string) => `⚠️ ${m}`),
            ...(dataB.suggestions || []).map((s: any) => `💡 ${s.card}: ${s.reason || ""}`),
          ].join("\n");
        }
      } catch (e: any) {
        results.push({ testCase: tc, error: e.message, judge: null });
        continue;
      }

      const validationA = tc.expectedChecks ? await validateResponse(responseA, tc, validationOpts) : null;
      const validationB = tc.expectedChecks ? await validateResponse(responseB, tc, validationOpts) : null;

      const scoreA = validationA?.overall?.score ?? 0;
      const scoreB = validationB?.overall?.score ?? 0;
      let winnerByValidator: "A" | "B" | "TIE" = "TIE";
      if (scoreA > scoreB) winnerByValidator = "A";
      else if (scoreB > scoreA) winnerByValidator = "B";

      const scoreDiff = Math.abs(scoreA - scoreB);
      const isCloseCall = scoreDiff <= close_call_threshold;
      const shouldRunJudge =
        judge_mode === "all" ||
        (judge_mode === "close_calls" && isCloseCall) ||
        (judge_mode === "sample" && Math.random() < sample_rate);

      let judgeResult: any = null;
      let winnerByJudge: "A" | "B" | "TIE" = winnerByValidator;
      let judgeConfidence = 0.5;

      if (shouldRunJudge && apiKey) {
        const judgeOut = await runPairwiseJudge(
          tc,
          responseA,
          responseB,
          {
            apiKey,
            model: judge_model || process.env.MODEL_AI_TEST || "gpt-4o-mini",
            evalRunId: evalRun.id,
            supabase,
          }
        );
        if (judgeOut.result) {
          judgeResult = judgeOut.result;
          winnerByJudge = judgeOut.result.winner;
          judgeConfidence = judgeOut.result.confidence;
        } else {
          judgeResult = fallbackJudgeResult(scoreA, scoreB);
          winnerByJudge = judgeResult.winner;
          judgeConfidence = judgeResult.confidence;
        }
      } else {
        judgeResult = { winner: winnerByValidator, score_a: scoreA, score_b: scoreB, rubric_version: "validator_only", reasoning: `Validator scores: A=${scoreA}, B=${scoreB}` };
      }

      const judge = {
        ...judgeResult,
        score_a: scoreA,
        score_b: scoreB,
        rubric_version: rubric_version,
        winner_by_validator: winnerByValidator,
        winner_by_judge: winnerByJudge,
      };

      await supabase.from("ai_pairwise_results").insert({
        eval_run_id: evalRun.id,
        test_case_id: tc.id,
        prompt_a_id: promptA,
        prompt_b_id: promptB,
        response_a_text: responseA,
        response_b_text: responseB,
        judge,
        winner_by_validator: winnerByValidator,
        winner_by_judge: winnerByJudge,
        judge_confidence: judgeConfidence,
        rubric_version: rubric_version,
      });

      results.push({
        testCase: tc,
        responseA,
        responseB,
        validationA,
        validationB,
        judge,
        winnerByValidator,
        winnerByJudge,
        judgeConfidence,
      });
    }
    } finally {
      restoreActive();
    }

    const n = results.length;
    const winsAByJudge = results.filter((r) => r.winnerByJudge === "A").length;
    const winsBByJudge = results.filter((r) => r.winnerByJudge === "B").length;
    const tiesByJudge = results.filter((r) => r.winnerByJudge === "TIE").length;
    const winsAByValidator = results.filter((r) => r.winnerByValidator === "A").length;
    const winsBByValidator = results.filter((r) => r.winnerByValidator === "B").length;
    const tiesByValidator = results.filter((r) => r.winnerByValidator === "TIE").length;
    const disagreements = results.filter((r) => r.winnerByJudge !== r.winnerByValidator).length;
    const disagreementRate = n > 0 ? (disagreements / n) * 100 : 0;
    const avgJudgeConfidence =
      n > 0 ? results.reduce((s, r) => s + (r.judgeConfidence ?? 0), 0) / n : 0;

    const judgeScores = results.flatMap((r) => (r.judge?.scores ? [r.judge.scores] : []));
    const avgRubricScores =
      judgeScores.length > 0
        ? {
            clarity: judgeScores.reduce((s, x) => s + (x.clarity ?? 0), 0) / judgeScores.length,
            specificity: judgeScores.reduce((s, x) => s + (x.specificity ?? 0), 0) / judgeScores.length,
            actionability: judgeScores.reduce((s, x) => s + (x.actionability ?? 0), 0) / judgeScores.length,
            correctness: judgeScores.reduce((s, x) => s + (x.correctness ?? 0), 0) / judgeScores.length,
            constraint_following: judgeScores.reduce((s, x) => s + (x.constraint_following ?? 0), 0) / judgeScores.length,
            tone: judgeScores.reduce((s, x) => s + (x.tone ?? 0), 0) / judgeScores.length,
            calibration: judgeScores.reduce((s, x) => s + (x.calibration ?? 0), 0) / judgeScores.length,
          }
        : null;

    await supabase
      .from("eval_runs")
      .update({
        status: "complete",
        meta: {
          pairwise: true,
          prompt_a: promptA,
          prompt_b: promptB,
          wins_a_by_judge: winsAByJudge,
          wins_b_by_judge: winsBByJudge,
          ties_by_judge: tiesByJudge,
          wins_a_by_validator: winsAByValidator,
          wins_b_by_validator: winsBByValidator,
          ties_by_validator: tiesByValidator,
          win_rate_a_by_judge: n > 0 ? (winsAByJudge / n) * 100 : 0,
          win_rate_b_by_judge: n > 0 ? (winsBByJudge / n) * 100 : 0,
          win_rate_a_by_validator: n > 0 ? (winsAByValidator / n) * 100 : 0,
          win_rate_b_by_validator: n > 0 ? (winsBByValidator / n) * 100 : 0,
          disagreement_rate: disagreementRate,
          avg_judge_confidence: Math.round(avgJudgeConfidence * 100) / 100,
          avg_rubric_scores: avgRubricScores,
          test_count: n,
        },
      })
      .eq("id", evalRun.id);

    const tieRateByJudge = n > 0 ? (tiesByJudge / n) * 100 : 0;
    const tieRateByValidator = n > 0 ? (tiesByValidator / n) * 100 : 0;

    return NextResponse.json({
      ok: true,
      evalRunId: evalRun.id,
      summary: {
        winsAByJudge,
        winsBByJudge,
        tiesByJudge,
        winsAByValidator,
        winsBByValidator,
        tiesByValidator,
        winRateAByJudge: n > 0 ? (winsAByJudge / n) * 100 : 0,
        winRateBByJudge: n > 0 ? (winsBByJudge / n) * 100 : 0,
        tieRateByJudge,
        winRateAByValidator: n > 0 ? (winsAByValidator / n) * 100 : 0,
        winRateBByValidator: n > 0 ? (winsBByValidator / n) * 100 : 0,
        tieRateByValidator,
        disagreementRate,
        avgJudgeConfidence: Math.round(avgJudgeConfidence * 100) / 100,
        avgRubricScores,
        n,
      },
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
