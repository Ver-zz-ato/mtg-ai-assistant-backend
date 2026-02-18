import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getPromptVersion } from "@/lib/config/prompts";
import { validateResponse, type ValidatorBreakdown } from "@/lib/ai/test-validator";

export const runtime = "nodejs";

/** Gating config derived from eval set + preset overrides */
type GatingConfig = {
  min_overall_score: number;
  max_critical_violations: number;
  max_total_violations: number;
  min_specificity_score: number;
  min_actionability_score: number;
  min_format_legality_score: number;
  require_clarifying_question_when_missing_info: boolean;
  require_refusal_on_illegal_request: boolean;
};

function resolveGatingConfig(evalSet: any): GatingConfig {
  const preset = evalSet.difficulty_preset || "standard";
  const type = evalSet.type || "mixed";

  let cfg: GatingConfig = {
    min_overall_score: Number(evalSet.min_overall_score ?? 80),
    max_critical_violations: Number(evalSet.max_critical_violations ?? 0),
    max_total_violations: Number(evalSet.max_total_violations ?? 2),
    min_specificity_score: Number(evalSet.min_specificity_score ?? 70),
    min_actionability_score: Number(evalSet.min_actionability_score ?? 70),
    min_format_legality_score: Number(evalSet.min_format_legality_score ?? 90),
    require_clarifying_question_when_missing_info: evalSet.require_clarifying_question_when_missing_info === true,
    require_refusal_on_illegal_request: evalSet.require_refusal_on_illegal_request !== false,
  };

  if (preset === "strict") {
    if (type === "golden_deck") {
      cfg.min_format_legality_score = Math.max(cfg.min_format_legality_score, 90);
      cfg.max_total_violations = Math.min(cfg.max_total_violations, 1);
    } else if (type === "golden_chat") {
      cfg.min_actionability_score = Math.max(cfg.min_actionability_score, 75);
      cfg.min_specificity_score = Math.max(cfg.min_specificity_score, 75);
    }
  } else if (preset === "safety_first") {
    cfg.min_format_legality_score = Math.max(cfg.min_format_legality_score, 95);
    cfg.max_critical_violations = 0;
    cfg.max_total_violations = Math.min(cfg.max_total_violations, 1);
    cfg.min_actionability_score = Math.max(cfg.min_actionability_score, 75);
    cfg.min_specificity_score = Math.max(cfg.min_specificity_score, 75);
  }

  return cfg;
}

function evaluateAgainstGating(
  breakdown: ValidatorBreakdown | undefined,
  cfg: GatingConfig,
  testCase: { id: string; tags?: string[] },
  formatKey: string | undefined
): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!breakdown) {
    return { passed: false, reasons: ["No validator breakdown"] };
  }

  const { overallScore, categoryScores, violations, flags } = breakdown;

  if (overallScore < cfg.min_overall_score) {
    reasons.push(`Overall score ${overallScore} < ${cfg.min_overall_score}`);
  }
  if (violations.critical > cfg.max_critical_violations) {
    reasons.push(`Critical violations ${violations.critical} > ${cfg.max_critical_violations}`);
  }
  if (violations.total > cfg.max_total_violations) {
    reasons.push(`Total violations ${violations.total} > ${cfg.max_total_violations}`);
  }
  if (categoryScores.specificity < cfg.min_specificity_score) {
    reasons.push(`Specificity ${categoryScores.specificity} < ${cfg.min_specificity_score}`);
  }
  if (categoryScores.actionability < cfg.min_actionability_score) {
    reasons.push(`Actionability ${categoryScores.actionability} < ${cfg.min_actionability_score}`);
  }
  if (formatKey && categoryScores.legality < cfg.min_format_legality_score) {
    reasons.push(`Format legality ${categoryScores.legality} < ${cfg.min_format_legality_score}`);
  }
  if (cfg.require_clarifying_question_when_missing_info && !flags.askedClarifyingQuestions) {
    reasons.push("Missing clarifying question when info was missing");
  }
  const hasIllegalTag = (testCase.tags || []).some((t) => String(t).toLowerCase().includes("illegal_request"));
  if (cfg.require_refusal_on_illegal_request && hasIllegalTag && !flags.refusedWhenNeeded) {
    reasons.push("Expected refusal on illegal request but none detected");
  }

  return {
    passed: reasons.length === 0,
    reasons,
  };
}

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
    const { eval_set_id, validation_options, format_key } = body;

    if (!eval_set_id) {
      return NextResponse.json({ ok: false, error: "eval_set_id required" }, { status: 400 });
    }

    const { data: evalSet, error: setError } = await supabase
      .from("ai_eval_sets")
      .select("*")
      .eq("id", eval_set_id)
      .single();

    if (setError || !evalSet) {
      return NextResponse.json({ ok: false, error: "Eval set not found" }, { status: 404 });
    }

    const testCaseIds = evalSet.test_case_ids || [];
    if (testCaseIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Eval set has no test cases" }, { status: 400 });
    }

    const { data: testCases, error: casesError } = await supabase
      .from("ai_test_cases")
      .select("*")
      .in("id", testCaseIds);

    if (casesError || !testCases || testCases.length === 0) {
      return NextResponse.json({ ok: false, error: "No test cases found for this set" }, { status: 400 });
    }

    const promptKind = testCases[0]?.type === "deck_analysis" ? "deck_analysis" : "chat";
    const promptVersion = await getPromptVersion(promptKind);
    const promptVersionId = promptVersion?.id || null;

    const suiteName = `golden-${evalSet.name}-${new Date().toISOString().slice(0, 10)}`;
    const { data: evalRun, error: evalError } = await supabase
      .from("eval_runs")
      .insert({
        suite: suiteName,
        prompts: promptVersionId ? [promptVersionId] : [],
        status: "running",
        meta: {
          test_count: testCases.length,
          prompt_kind: promptKind,
          eval_set_id: eval_set_id,
          golden_set: true,
        },
      })
      .select("id")
      .single();

    if (evalError || !evalRun) {
      return NextResponse.json({ ok: false, error: "Failed to create eval_run" }, { status: 500 });
    }

    const apiKey = process.env.OPENAI_API_KEY || "";
    const batchFormatKey = format_key ?? "commander";

    let batchTestThreadId: string | null = null;
    const { data: existingThread } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("user_id", user.id)
      .eq("title", "Batch Test Thread")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingThread) batchTestThreadId = existingThread.id;
    else {
      const { data: newThread } = await supabase
        .from("chat_threads")
        .insert({ user_id: user.id, title: "Batch Test Thread" })
        .select("id")
        .single();
      if (newThread) batchTestThreadId = newThread.id;
    }

    const gatingConfig = resolveGatingConfig(evalSet);
    const strict = evalSet.strict !== false;

    const formattedCases = testCases.map((tc: any) => ({
      id: tc.id,
      name: tc.name,
      type: tc.type,
      input: tc.input,
      expectedChecks: tc.expected_checks,
      tags: tc.tags || [],
    }));

    const results: any[] = [];
    const concurrencyLimit = 8;

    for (let i = 0; i < formattedCases.length; i += concurrencyLimit) {
      const batch = formattedCases.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map(async (testCase: any) => {
        let responseText = "";
        let promptUsed: any = {};
        try {
          if (testCase.type === "chat") {
            const baseUrl = req.url.split("/api/admin")[0];
            const chatResponse = await fetch(`${baseUrl}/api/chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") || "" },
              body: JSON.stringify({
                text: testCase.input.userMessage,
                threadId: batchTestThreadId,
                prefs: { format: batchFormatKey ?? testCase.input?.format, teaching: testCase.input?.context?.teaching || false },
                context: testCase.input.context,
                noUserInsert: true,
                forceModel: process.env.MODEL_AI_TEST || "gpt-4o-mini",
                eval_run_id: evalRun.id,
              }),
            });
            const chatData = await chatResponse.json();
            if (!chatResponse.ok || chatData.fallback) {
              return { testCase, error: chatData.error || "Chat API failed", validation: null };
            }
            responseText = chatData.text || "";
            promptUsed = { system: "[Built in /api/chat]", user: testCase.input.userMessage };
          } else if (testCase.type === "deck_analysis") {
            const baseUrl = req.url.split("/api/admin")[0];
            const analysisResponse = await fetch(`${baseUrl}/api/deck/analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") || "" },
              body: JSON.stringify({
                deckText: testCase.input.deckText || "",
                userMessage: testCase.input.userMessage,
                format: testCase.input.format || "Commander",
                commander: testCase.input.commander,
                colors: testCase.input.colors || [],
                plan: testCase.input.context?.plan || "Optimized",
                currency: testCase.input.context?.currency || "USD",
                forceModel: process.env.MODEL_AI_TEST || "gpt-4o-mini",
                eval_run_id: evalRun.id,
                sourcePage: "admin_ai_test",
              }),
            });
            const analysisData = await analysisResponse.json();
            if (!analysisResponse.ok || analysisData.error) {
              return { testCase, error: analysisData.error || "Deck analysis failed", validation: null };
            }
            const suggestions = analysisData.suggestions || [];
            const whatsGood = analysisData.whatsGood || [];
            const quickFixes = analysisData.quickFixes || [];
            responseText = [
              ...whatsGood.map((msg: string) => `✅ ${msg}`),
              ...quickFixes.map((msg: string) => `⚠️ ${msg}`),
              ...suggestions.map((s: any) => `💡 ${s.card}: ${s.reason || ""}`),
            ].join("\n");
            promptUsed = { system: "[Built in deck/analyze]", user: testCase.input.userMessage || "Analyze this deck" };
          }
        } catch (e: any) {
          return { testCase, error: e.message || "Request failed", validation: null };
        }

        let validation: any = null;
        if (responseText && testCase.expectedChecks) {
          const opts = {
            runKeywordChecks: validation_options?.runKeywordChecks !== false,
            runLLMFactCheck: validation_options?.runLLMFactCheck === true,
            runReferenceCompare: validation_options?.runReferenceCompare === true,
            runSemanticCheck: validation_options?.runSemanticCheck === true,
            runAdvancedJudges: validation_options?.runAdvancedJudges !== false,
            apiKey: (validation_options?.runLLMFactCheck || validation_options?.runSemanticCheck) ? apiKey : undefined,
            supabase,
          };
          validation = await validateResponse(responseText, testCase, opts);
        }

        if (testCase.id) {
          await supabase.from("ai_test_results").insert({
            test_case_id: testCase.id,
            eval_run_id: evalRun.id,
            prompt_version_id: promptVersionId,
            response_text: responseText,
            prompt_used: promptUsed,
            validation_results: validation,
          });
        }

        return { testCase, response: { text: responseText }, validation };
      });
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const formatKeyForGating = format_key ?? batchFormatKey;
    const evaluated = results.map((r) => {
      const breakdown = r.validation?.validatorBreakdown as ValidatorBreakdown | undefined;
      const evalResult = evaluateAgainstGating(
        breakdown,
        gatingConfig,
        { id: r.testCase?.id ?? "", tags: r.testCase?.tags ?? [] },
        formatKeyForGating
      );
      return {
        result: r,
        passed: evalResult.passed,
        reasons: evalResult.reasons,
        breakdown,
      };
    });

    const passCount = evaluated.filter((e) => e.passed).length;
    const failCount = evaluated.length - passCount;
    const passRate = evaluated.length > 0 ? Math.round((passCount / evaluated.length) * 100) : 0;
    const setPassed = strict ? failCount === 0 : passRate >= 70;

    const failingCases = evaluated.filter((e) => !e.passed);
    const failing_case_ids = failingCases.map((e) => e.result.testCase?.id).filter(Boolean) as string[];

    const categoryFailCounts: Record<string, number> = {};
    const reasonToCategory = (r: string): string => {
      if (r.startsWith("Overall score")) return "overall_score";
      if (r.startsWith("Critical violations")) return "critical_violations";
      if (r.startsWith("Total violations")) return "total_violations";
      if (r.startsWith("Specificity")) return "specificity";
      if (r.startsWith("Actionability")) return "actionability";
      if (r.startsWith("Format legality")) return "format_legality";
      if (r.startsWith("Missing clarifying")) return "clarifying_question";
      if (r.startsWith("Expected refusal")) return "refusal_on_illegal";
      if (r.startsWith("No validator")) return "no_breakdown";
      return "other";
    };
    for (const e of failingCases) {
      for (const r of e.reasons ?? []) {
        const cat = reasonToCategory(r);
        categoryFailCounts[cat] = (categoryFailCounts[cat] ?? 0) + 1;
      }
    }
    const top_failing_categories = Object.entries(categoryFailCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => ({ category: k, count: v }));

    const worst_offenders = failingCases
      .slice(0, 10)
      .map((e) => ({
        case_id: e.result.testCase?.id,
        case_name: e.result.testCase?.name,
        reasons: e.reasons,
        score: e.breakdown?.overallScore ?? e.result.validation?.overall?.score,
      }));

    const regression_hints: string[] = [];
    if (top_failing_categories.length > 0) {
      regression_hints.push(
        `Top failing categories: ${top_failing_categories.map((c) => `${c.category} (${c.count})`).join(", ")}`
      );
    }
    if (worst_offenders.length > 0) {
      const topReasons = new Set<string>();
      for (const o of worst_offenders) {
        for (const r of o.reasons ?? []) topReasons.add(r);
      }
      regression_hints.push(`Common failure reasons: ${[...topReasons].slice(0, 5).join("; ")}`);
    }

    const failures = failingCases.map((e) => ({
      name: e.result.testCase?.name,
      score: e.breakdown?.overallScore ?? e.result.validation?.overall?.score,
      reasons: e.reasons,
    }));

    await supabase.from("eval_runs").update({
      status: "complete",
      meta: {
        test_count: results.length,
        pass_count: passCount,
        fail_count: failCount,
        pass_rate: passRate,
        prompt_kind: promptKind,
        eval_set_id,
        golden_set: true,
        strict,
        set_passed: setPassed,
      },
    }).eq("id", evalRun.id);

    await supabase.from("ai_eval_set_runs").insert({
      eval_run_id: evalRun.id,
      eval_set_id: eval_set_id,
      pass: setPassed,
      meta: {
        pass_rate: passRate,
        pass_count: passCount,
        fail_count: failCount,
        failing_case_ids,
        top_failing_categories,
        worst_offenders,
        regression_hints,
        failures: failures.slice(0, 20),
        gating_config: gatingConfig,
      },
    });

    return NextResponse.json({
      ok: true,
      evalRunId: evalRun.id,
      evalSetRun: { pass: setPassed, passRate, passCount, failCount, failures },
      results,
      summary: { total: results.length, passed: passCount, failed: failCount, passRate, setPassed },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
