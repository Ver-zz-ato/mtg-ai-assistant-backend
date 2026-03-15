import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { SCENARIOS } from "@/lib/admin/ai-v2/scenarios";
import { runScenarios, buildRunSummary } from "@/lib/admin/ai-v2/runner";
import type { Scenario } from "@/lib/admin/ai-v2/types";
import { runV3Scenario, runV4Scenario } from "@/lib/admin/ai-v3/model-runner";
import type { ModelRunnerScenario } from "@/lib/admin/ai-v3/model-runner";
import { MONO_GREEN_DECKLIST } from "@/lib/admin/ai-v2/fixtures";

export const runtime = "nodejs";
export const maxDuration = 300;

function mapV2StatusToResultStatus(
  status: "PASS" | "PASS_WITH_WARNINGS" | "SOFT_FAIL" | "HARD_FAIL" | undefined
): "PASS" | "WARN" | "FAIL" | "HARD_FAIL" {
  if (status === "PASS") return "PASS";
  if (status === "PASS_WITH_WARNINGS") return "WARN";
  if (status === "SOFT_FAIL") return "FAIL";
  return "HARD_FAIL";
}

export async function POST(req: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  let body: { suiteKey?: string; scenarioIds?: string[]; runMode?: string; modelName?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const suiteKey = body.suiteKey ?? "v2";
  const scenarioIds = Array.isArray(body.scenarioIds) ? body.scenarioIds : undefined;
  const runMode = body.runMode ?? "full";
  const modelName = body.modelName ?? null;

  if (!["v1", "v2", "v3", "v4", "v5"].includes(suiteKey)) {
    return NextResponse.json({ ok: false, error: "Invalid suiteKey" }, { status: 400 });
  }

  let rows: Array<{ id: string; suite_key: string; scenario_key: string; title?: string; scenario_definition_json: { v2ScenarioId?: string; userMessage?: string; deckContext?: string } }>;
  let v2Scenarios: Scenario[] = [];
  const regressionIdByV2Id: Record<string, string> = {};

  if (suiteKey === "v5") {
    const { data: regressions, error: regError } = await supabase
      .from("ai_test_regressions")
      .select("id, title, scenario_definition_json")
      .eq("is_active", true);
    if (regError) {
      return NextResponse.json({ ok: false, error: regError.message }, { status: 500 });
    }
    const regList = regressions ?? [];
    const v2IdsFromReg = regList
      .map((r: { scenario_definition_json: { v2ScenarioId?: string } }) => r.scenario_definition_json?.v2ScenarioId)
      .filter(Boolean) as string[];
    v2Scenarios = SCENARIOS.filter((s) => v2IdsFromReg.includes(s.id));
    regList.forEach((r: { id: string; scenario_definition_json: { v2ScenarioId?: string }; title: string }) => {
      const v2Id = r.scenario_definition_json?.v2ScenarioId;
      if (v2Id) regressionIdByV2Id[v2Id] = r.id;
    });
    rows = v2Scenarios.map((s) => ({
      id: regressionIdByV2Id[s.id] ?? s.id,
      suite_key: "v5",
      scenario_key: s.id,
      title: s.title,
      scenario_definition_json: { v2ScenarioId: s.id },
    }));
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "No active regressions with valid v2ScenarioId" }, { status: 400 });
    }
  } else {
    // Load scenarios from DB for v1, v2, v3, or v4
    let query = supabase
      .from("ai_test_scenarios")
      .select("id, suite_key, scenario_key, title, scenario_definition_json")
      .eq("suite_key", suiteKey)
      .eq("is_active", true);
    if (scenarioIds?.length) {
      query = query.in("id", scenarioIds);
    }
    const { data: scenarioRows, error: scenariosError } = await query;
    if (scenariosError) {
      return NextResponse.json({ ok: false, error: scenariosError.message }, { status: 500 });
    }
    rows = scenarioRows ?? [];
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "No scenarios to run" }, { status: 400 });
    }
    if (suiteKey === "v1" || suiteKey === "v2") {
      const v2Ids = rows
        .map((r: { scenario_definition_json: { v2ScenarioId?: string } }) => r.scenario_definition_json?.v2ScenarioId)
        .filter(Boolean) as string[];
      v2Scenarios = SCENARIOS.filter((s) => v2Ids.includes(s.id));
      if (v2Scenarios.length === 0) {
        return NextResponse.json({ ok: false, error: "No matching V2 scenarios found" }, { status: 400 });
      }
    }
  }

  const totalScenarios = suiteKey === "v3" || suiteKey === "v4" ? rows.length : v2Scenarios.length;

  // Create run row (running)
  const { data: runRow, error: runInsertError } = await supabase
    .from("ai_test_runs")
    .insert({
      suite_key: suiteKey,
      run_mode: runMode,
      model_name: modelName,
      status: "running",
      total: totalScenarios,
      passed: 0,
      warned: 0,
      failed: 0,
      hard_failures: 0,
      soft_failures: 0,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runInsertError || !runRow) {
    return NextResponse.json({ ok: false, error: runInsertError?.message ?? "Failed to create run" }, { status: 500 });
  }
  const runId = runRow.id;

  try {
    let passed = 0;
    let warned = 0;
    let failed = 0;
    let hardCount = 0;
    let softCount = 0;
    const toInsert: Array<{
      run_id: string;
      scenario_id: string | null;
      suite_key: string;
      scenario_key: string;
      status: string;
      score_json: object;
      hard_failures_json: unknown[];
      soft_failures_json: unknown[];
      prompt_excerpt: string | null;
      output_text: string | null;
      validator_findings_json: unknown[];
      debug_json: object;
    }> = [];
    let summary: Record<string, unknown>;

    if (suiteKey === "v3" || suiteKey === "v4") {
      const baseUrl = req.nextUrl.origin;
      const cookie = req.headers.get("cookie") ?? "";
      const evalRunId = runId;
      const callChat = async (body: { text: string; deckText?: string | null; evalRunId?: string; modelName?: string | null }) => {
        const payload: Record<string, unknown> = {
          text: body.text,
          threadId: null,
          prefs: { format: "Commander" },
          noUserInsert: true,
          eval_run_id: body.evalRunId ?? evalRunId,
          forceModel: modelName ?? process.env.MODEL_AI_TEST ?? undefined,
        };
        if (typeof body.deckText === "string" && body.deckText.trim()) {
          payload.deckText = body.deckText.trim();
        }
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify(payload),
        });
        let data: { text?: string; fallback?: boolean; error?: string; message?: string; reason?: string } = {};
        try {
          data = await res.json();
        } catch {
          data = {};
        }
        const text =
          typeof data?.text === "string"
            ? data.text
            : !res.ok
              ? (data?.error ?? data?.message ?? data?.reason ?? `HTTP ${res.status}`)
              : "";
        const fallback = !res.ok || !!data?.fallback;
        return { text, fallback };
      };
      const modelScenarios: ModelRunnerScenario[] = rows.map((r) => ({
        id: r.id,
        scenario_key: r.scenario_key,
        suite_key: r.suite_key,
        scenario_definition_json: r.scenario_definition_json as ModelRunnerScenario["scenario_definition_json"],
      }));
      const runOpts = {
        callChat,
        evalRunId,
        modelName: modelName ?? undefined,
        deckText: MONO_GREEN_DECKLIST,
      };
      const results = suiteKey === "v3"
        ? await Promise.all(modelScenarios.map((s) => runV3Scenario(s, runOpts)))
        : await Promise.all(modelScenarios.map((s) => runV4Scenario(s, runOpts)));
      for (const r of results) {
        if (r.status === "PASS") passed++;
        else if (r.status === "WARN") warned++;
        else failed++;
        hardCount += r.hardFailures.length;
        softCount += r.softFailures.length;
        toInsert.push({
          run_id: runId,
          scenario_id: r.scenarioId,
          suite_key: suiteKey,
          scenario_key: r.scenarioKey,
          status: r.status,
          score_json: r.score ?? {},
          hard_failures_json: r.hardFailures,
          soft_failures_json: r.softFailures,
          prompt_excerpt: null,
          output_text: r.outputText ?? null,
          validator_findings_json: [],
          debug_json: r.debug ?? {},
        });
      }
      summary = { total: results.length, passed, failed, hardFailures: hardCount, softFailures: softCount };
    } else {
      const results = await runScenarios(v2Scenarios);
      summary = buildRunSummary(results);
      const scenarioKeyToRow: Record<string, { id: string | null; scenario_key: string }> = {};
      for (const r of rows) {
        const v2Id = r.scenario_definition_json?.v2ScenarioId ?? r.scenario_key;
        scenarioKeyToRow[v2Id] = {
          id: suiteKey === "v5" ? null : (r as { id: string }).id,
          scenario_key: r.scenario_key,
        };
      }
      for (const r of results) {
        const row = scenarioKeyToRow[r.scenarioId];
        const status = mapV2StatusToResultStatus(r.status);
        if (status === "PASS") passed++;
        else if (status === "WARN") warned++;
        else failed++;
        hardCount += r.hardFailures.length;
        softCount += r.softFailures.length;
        toInsert.push({
          run_id: runId,
          scenario_id: row?.id ?? null,
          suite_key: suiteKey,
          scenario_key: row?.scenario_key ?? r.scenarioId,
          status,
          score_json: {},
          hard_failures_json: r.hardFailures,
          soft_failures_json: r.softFailures,
          prompt_excerpt: r.debug?.promptExcerpt ?? null,
          output_text: r.modelResponse ?? null,
          validator_findings_json: r.validatorFindings ?? [],
          debug_json: r.debug ?? {},
        });
      }
    }

    if (toInsert.length > 0) {
      await supabase.from("ai_test_run_results").insert(toInsert);
    }
    await supabase
      .from("ai_test_runs")
      .update({
        status: "completed",
        passed,
        warned,
        failed,
        hard_failures: hardCount,
        soft_failures: softCount,
        completed_at: new Date().toISOString(),
        summary_json: summary,
      })
      .eq("id", runId);
  } catch (err) {
    await supabase
      .from("ai_test_runs")
      .update({ status: "failed", completed_at: new Date().toISOString() })
      .eq("id", runId);
    return NextResponse.json({
      ok: false,
      error: (err as Error)?.message ?? "Run failed",
      runId,
    }, { status: 500 });
  }

  const { data: updatedRun } = await supabase.from("ai_test_runs").select("*").eq("id", runId).single();
  return NextResponse.json({
    ok: true,
    runId,
    run: updatedRun,
    summary: {
      total: updatedRun?.total ?? 0,
      passed: updatedRun?.passed ?? 0,
      warned: updatedRun?.warned ?? 0,
      failed: updatedRun?.failed ?? 0,
      hard_failures: updatedRun?.hard_failures ?? 0,
      soft_failures: updatedRun?.soft_failures ?? 0,
    },
  });
}
