import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getPromptVersion, getPromptVersionById } from "@/lib/config/prompts";
import { getAdmin } from "@/app/api/_lib/supa";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min for full challenge

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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OpenAI API key required" }, { status: 500 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Admin client required" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { kind = "chat", evalSetId, testLimit = 15 } = body;

    const promptKind = kind === "deck_analysis" ? "deck_analysis" : "chat";
    const currentPrompt = await getPromptVersion(promptKind);
    if (!currentPrompt) {
      return NextResponse.json({ ok: false, error: "No current prompt found" }, { status: 400 });
    }

    // 1. Get weakest categories from last run
    const { data: lastResults } = await supabase
      .from("ai_test_results")
      .select("test_case_id, validation_results")
      .order("created_at", { ascending: false })
      .limit(200);

    const categoryScores: Record<string, number[]> = {};
    const violationCounts: Record<string, number> = {};
    for (const r of lastResults || []) {
      const vb = (r.validation_results as any)?.validatorBreakdown;
      if (vb?.categoryScores) {
        for (const [k, v] of Object.entries(vb.categoryScores)) {
          if (typeof v === "number") {
            if (!categoryScores[k]) categoryScores[k] = [];
            categoryScores[k].push(v);
          }
        }
      }
      const v = (r.validation_results as any)?.validatorBreakdown?.violations;
      if (v?.messages) {
        for (const msg of v.messages) {
          const key = String(msg).slice(0, 50);
          violationCounts[key] = (violationCounts[key] || 0) + 1;
        }
      }
    }

    const avgByCat = Object.fromEntries(
      Object.entries(categoryScores).map(([k, arr]) => [
        k,
        arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 80,
      ])
    );
    const weakest = Object.entries(avgByCat).sort((a, b) => a[1] - b[1]).slice(0, 3);
    const weakestDesc = weakest.map(([k, v]) => `${k}: ${Math.round(v)}%`).join("; ");

    // 2. Get test cases (golden set or lowest-performing)
    let testCaseIds: string[] = [];
    if (evalSetId) {
      const { data: set } = await supabase.from("ai_eval_sets").select("test_case_ids").eq("id", evalSetId).single();
      testCaseIds = (set?.test_case_ids || []).slice(0, testLimit);
    }
    if (testCaseIds.length === 0) {
      const { data: cases } = await supabase
        .from("ai_test_cases")
        .select("id, name, type, input, expected_checks, tags")
        .limit(testLimit);
      testCaseIds = (cases || []).map((c: any) => c.id);
    }

    if (testCaseIds.length === 0) {
      return NextResponse.json({ ok: false, error: "No test cases available" }, { status: 400 });
    }

    const { data: testCases } = await supabase
      .from("ai_test_cases")
      .select("id, name, type, input, expected_checks, tags")
      .in("id", testCaseIds);

    if (!testCases?.length) {
      return NextResponse.json({ ok: false, error: "Test cases not found" }, { status: 400 });
    }

    const formattedCases = testCases.map((tc: any) => ({
      id: tc.id,
      name: tc.name,
      type: tc.type,
      input: tc.input,
      expectedChecks: tc.expected_checks,
      tags: tc.tags || [],
    }));

    // 3. Generate B and C variants via LLM
    const systemPrompt = `You are a prompt engineer for a Magic: The Gathering AI assistant. Generate two improved prompt variants.

Current weakest categories: ${weakestDesc}

Return JSON:
{
  "variant_b": { "system_prompt": "full system prompt text for B - strengthen weakest categories", "rationale": "brief" },
  "variant_c": { "system_prompt": "full system prompt text for C - radical rewrite focusing on clarity + constraint enforcement", "rationale": "brief" }
}

Variant B: Incremental improvement targeting the weak areas.
Variant C: More aggressive rewrite - clearer structure, stronger enforcement of rules.`;

    const userPrompt = `Current prompt (first 3000 chars):\n${currentPrompt.system_prompt.slice(0, 3000)}\n\nGenerate variants B and C.`;

    const llmRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(
        prepareOpenAIBody({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          max_completion_tokens: 8000,
          response_format: { type: "json_object" },
        } as Record<string, unknown>)
      ),
    });

    if (!llmRes.ok) {
      const err = await llmRes.text();
      return NextResponse.json({ ok: false, error: `LLM failed: ${err}` }, { status: 500 });
    }

    const llmData = await llmRes.json();
    const content = llmData.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ ok: false, error: "No LLM content" }, { status: 500 });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid LLM JSON" }, { status: 500 });
    }

    const promptB = parsed.variant_b?.system_prompt || currentPrompt.system_prompt;
    const promptC = parsed.variant_c?.system_prompt || currentPrompt.system_prompt;

    // 4. Create prompt versions for B and C
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const { data: verB } = await admin
      .from("prompt_versions")
      .insert({
        kind: promptKind,
        version: `auto-challenge-B-${ts}`,
        system_prompt: promptB,
        meta: { source: "auto-challenge", rationale: parsed.variant_b?.rationale },
      })
      .select("id, version")
      .single();

    const { data: verC } = await admin
      .from("prompt_versions")
      .insert({
        kind: promptKind,
        version: `auto-challenge-C-${ts}`,
        system_prompt: promptC,
        meta: { source: "auto-challenge", rationale: parsed.variant_c?.rationale },
      })
      .select("id, version")
      .single();

    if (!verB || !verC) {
      return NextResponse.json({ ok: false, error: "Failed to create prompt versions" }, { status: 500 });
    }

    // 5. Run batch with each prompt and compare
    const baseUrl = req.url.split("/api/admin")[0];
    const cookie = req.headers.get("cookie") || "";

    const runBatchWithPrompt = async (promptVersionId: string): Promise<{ passRate: number; passCount: number; total: number }> => {
      await admin
        .from("app_config")
        .upsert(
          { key: `active_prompt_version_${promptKind}`, value: { id: promptVersionId, version: "temp" } },
          { onConflict: "key" }
        );

      const r = await fetch(`${baseUrl}/api/admin/ai-test/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          testCases: formattedCases,
          suite: `auto-challenge-${Date.now()}`,
          formatKey: "commander",
        }),
      });
      const j = await r.json();

      const passCount = j.results?.filter((x: any) => x.validation?.overall?.passed).length ?? 0;
      const total = j.results?.length ?? formattedCases.length;
      const passRate = total > 0 ? Math.round((passCount / total) * 100) : 0;
      return { passRate, passCount, total };
    };

    // Restore current prompt after runs
    const restoreCurrent = async () => {
      await admin
        .from("app_config")
        .upsert(
          { key: `active_prompt_version_${promptKind}`, value: { id: currentPrompt.id, version: currentPrompt.version } },
          { onConflict: "key" }
        );
    };

    let perfCurrent = { passRate: 0, passCount: 0, total: formattedCases.length };
    let perfB = { passRate: 0, passCount: 0, total: formattedCases.length };
    let perfC = { passRate: 0, passCount: 0, total: formattedCases.length };

    try {
      perfCurrent = await runBatchWithPrompt(currentPrompt.id);
      perfB = await runBatchWithPrompt(verB.id);
      perfC = await runBatchWithPrompt(verC.id);
    } finally {
      await restoreCurrent();
    }

    // 6. Determine winner
    const candidates = [
      { label: "current", passRate: perfCurrent.passRate, promptId: currentPrompt.id, version: currentPrompt.version },
      { label: "B", passRate: perfB.passRate, promptId: verB.id, version: verB.version },
      { label: "C", passRate: perfC.passRate, promptId: verC.id, version: verC.version },
    ];
    const winner = candidates.reduce((a, b) => (b.passRate > a.passRate ? b : a));
    const winRateDelta = winner.passRate - perfCurrent.passRate;

    // 7. Store candidates
    const { data: lastEvalRun } = await supabase
      .from("eval_runs")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    await supabase.from("ai_prompt_candidates").insert([
      {
        kind: promptKind,
        label: "B",
        system_prompt: promptB,
        prompt_version_id: verB.id,
        meta: { pass_rate: perfB.passRate, win_rate_delta: perfB.passRate - perfCurrent.passRate },
        auto_challenge_run_id: lastEvalRun?.id,
      },
      {
        kind: promptKind,
        label: "C",
        system_prompt: promptC,
        prompt_version_id: verC.id,
        meta: { pass_rate: perfC.passRate, win_rate_delta: perfC.passRate - perfCurrent.passRate },
        auto_challenge_run_id: lastEvalRun?.id,
      },
    ]);

    const riskAssessment =
      winRateDelta > 10
        ? "High improvement - recommend adoption with Golden Set verification"
        : winRateDelta > 5
          ? "Moderate improvement - safe to adopt"
          : winRateDelta > 0
            ? "Slight improvement - consider adoption"
            : "No improvement - keep current";

    return NextResponse.json({
      ok: true,
      summary: `Winner: Prompt ${winner.label} (+${winRateDelta}% vs current)`,
      recommended_prompt: winner.label,
      reasoning: `Prompt ${winner.label} achieved ${winner.passRate}% pass rate vs current ${perfCurrent.passRate}%.`,
      risk_assessment: riskAssessment,
      performance_diff: {
        current: perfCurrent,
        B: perfB,
        C: perfC,
        winner: winner.label,
        win_rate_delta: winRateDelta,
      },
      candidates: {
        current: { id: currentPrompt.id, version: currentPrompt.version },
        B: { id: verB.id, version: verB.version },
        C: { id: verC.id, version: verC.version },
      },
      adopt_prompt_id: winner.label !== "current" ? winner.promptId : null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
