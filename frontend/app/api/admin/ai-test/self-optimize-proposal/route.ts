import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getPromptVersion, getPromptVersionById, setActivePromptVersion } from "@/lib/config/prompts";
import { getAdmin } from "@/app/api/_lib/supa";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";

export const runtime = "nodejs";
export const maxDuration = 800; // 13.3 min - Vercel max

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

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Admin client required" }, { status: 500 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OpenAI API key required" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      scope = "golden+suite+deck_samples",
      candidate_count = 2,
      deck_sample_count = 50,
      judge_mode = "close_calls",
      close_call_threshold = 5,
      cost_guardrails = { max_cost_increase_pct: 10, max_latency_increase_pct: 10 },
      require_golden_pass = true,
      kind = "chat",
      stream: wantStream = false,
    } = body;

    const baseUrl = req.url.split("/api/admin")[0];
    type ProgressFn = (step: string, progress: number) => void;
    const noop: ProgressFn = () => {};
    const cookie = req.headers.get("cookie") || "";
    const promptKind = kind === "deck_analysis" ? "deck_analysis" : "chat";

    const evidence: Record<string, unknown> = {};
    const steps: string[] = [];

    const run = async (prog: ProgressFn) => {
    // 1. Resolve current (A) and previous (Prev) prompt
    prog("Resolving prompts...", 2);
    const currentPrompt = await getPromptVersion(promptKind);
    if (!currentPrompt) {
      throw new Error("No current prompt found");
    }

    const { data: allVersions } = await admin
      .from("prompt_versions")
      .select("id, version, created_at")
      .eq("kind", promptKind)
      .order("created_at", { ascending: false })
      .limit(20);

    const prevVersion = (allVersions || []).find((v: any) => v.id !== currentPrompt.id);
    const prevPrompt = prevVersion ? await getPromptVersionById(prevVersion.id, promptKind) : null;
    steps.push(prevPrompt ? `Baseline: Current vs Previous (${prevPrompt.version})` : "Baseline: No previous version (N/A)");

    // 2. Sample decks FIRST and create deck-sample test cases (so we have tests even when ai_test_cases is empty)
    prog("Sampling public decks...", 5);
    steps.push("Sampling public decks...");
    const deckRes = await fetch(`${baseUrl}/api/admin/decks/sample-public?count=${deck_sample_count}`, { headers: { Cookie: cookie } });
    const deckData = await deckRes.json();
    if (!deckData.ok || !deckData.decks?.length) {
      throw new Error("No public decks to sample");
    }

    prog("Creating deck sample test cases...", 6);
    const deckSampleCases: any[] = [];
    const prompts = [
      "Analyze this Commander deck. Identify 3 upgrades and 3 cuts with reasons. Respect color identity.",
      "Find potential combos/synergies and 2 weak slots.",
    ];
    let lastInsertError: string | null = null;
    for (const deck of deckData.decks) {
      const deckText = deck.decklist_text || deck.deck_text || "";
      if (!deckText || deckText.length < 20) continue;
      for (let i = 0; i < Math.min(2, prompts.length); i++) {
        const input = {
          deckText,
          userMessage: prompts[i],
          format: deck.format || "Commander",
          commander: deck.commander,
          colors: deck.colors || [],
        };
        const tags = ["deck_sample", `deck_id:${deck.deck_id}`, deck.commander ? `commander:${deck.commander}` : ""].filter(Boolean);
        const { data: inserted, error: insertErr } = await supabase
          .from("ai_test_cases")
          .insert({
            name: `Deck sample: ${deck.commander || deck.title} (${i + 1})`,
            type: "deck_analysis",
            input,
            expected_checks: {},
            tags,
            source: "auto_deck_sample",
          })
          .select("id, name, input, tags")
          .single();
        if (insertErr) lastInsertError = insertErr.message;
        if (inserted) deckSampleCases.push({ ...inserted, expectedChecks: null, tags: inserted.tags || [] });
      }
    }
    evidence.deck_sample_ids = deckSampleCases.map((c: any) => c.id);
    evidence.deck_sample_count = deckSampleCases.length;

    if (deckSampleCases.length === 0) {
      const hint = lastInsertError ? ` (Insert error: ${lastInsertError})` : deckData.decks?.length ? " (All decks had empty decklists?)" : "";
      throw new Error(`No decks with decklists could be sampled.${hint}`);
    }

    prog("Checking Golden Set...", 12);
    // 3. Ensure Golden Set exists (optional when ai_test_cases is empty - we'll use deck samples only)
    let { data: evalSets } = await supabase.from("ai_eval_sets").select("id, name, test_case_ids").order("created_at", { ascending: false });
    if (!evalSets?.length) {
      steps.push("Auto-generating Golden Set (if ai_test_cases has data)...");
      const goldenRes = await fetch(`${baseUrl}/api/admin/ai-test/auto-golden-set`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
      });
      const goldenData = await goldenRes.json();
      if (goldenData.ok) {
        evidence.golden_set_created = true;
        evidence.golden_set_id = goldenData.set?.id;
        const { data: sets } = await supabase.from("ai_eval_sets").select("id, name, test_case_ids").order("created_at", { ascending: false });
        evalSets = sets || [];
      } else {
        steps.push("No ai_test_cases yet — using deck samples only. Golden Set skipped.");
      }
    }
    const goldenSet = evalSets?.[0] || null;
    const goldenCaseIds = (goldenSet?.test_case_ids || []) as string[];

    // 4. Load suite test cases (from ai_test_cases)
    const { data: suiteCases } = await supabase
      .from("ai_test_cases")
      .select("id, name, type, input, expected_checks, tags")
      .limit(50);
    const suiteCaseList = (suiteCases || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      input: c.input,
      expectedChecks: c.expected_checks,
      tags: c.tags || [],
    }));

    const allTestCases = [...suiteCaseList, ...deckSampleCases];
    const goldenCases = allTestCases.filter((c: any) => goldenCaseIds.includes(c.id));
    const testCaseIds = allTestCases.map((c: any) => c.id);

    const CHUNK_SIZE = 12; // Stay under 5min HeadersTimeoutError (Node fetch default)
    const runBatchWithPrompt = async (promptId: string): Promise<{ passRate: number; passCount: number; total: number; evalRunId?: number }> => {
      await setActivePromptVersion(promptKind, promptId);
      const chunks: typeof allTestCases[] = [];
      for (let i = 0; i < allTestCases.length; i += CHUNK_SIZE) {
        chunks.push(allTestCases.slice(i, i + CHUNK_SIZE));
      }
      let totalPass = 0;
      let totalRan = 0;
      let firstEvalRunId: number | undefined;
      for (let i = 0; i < chunks.length; i++) {
        const r = await fetch(`${baseUrl}/api/admin/ai-test/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({
            testCases: chunks[i],
            formatKey: "commander",
          }),
        });
        const j = await r.json();
        if (!j.ok && j.error) throw new Error(`Batch chunk ${i + 1}/${chunks.length}: ${j.error}`);
        const passCount = j.results?.filter((x: any) => x.validation?.overall?.passed).length ?? 0;
        const total = j.results?.length ?? chunks[i].length;
        totalPass += passCount;
        totalRan += total;
        if (firstEvalRunId == null) firstEvalRunId = j.evalRunId;
      }
      return {
        passRate: totalRan > 0 ? Math.round((totalPass / totalRan) * 100) : 0,
        passCount: totalPass,
        total: totalRan,
        evalRunId: firstEvalRunId,
      };
    };

    // 5. Run batch with A
    prog("Running suite with current prompt...", 18);
    steps.push("Running suite with current prompt...");
    const perfA = await runBatchWithPrompt(currentPrompt.id);
    evidence.eval_run_id_A = perfA.evalRunId;

    // 6. Run batch with Prev (if exists)
    let perfPrev: { passRate: number; passCount: number; total: number; evalRunId?: number } | null = null;
    if (prevPrompt) {
      prog("Running suite with previous prompt...", 28);
      steps.push("Running suite with previous prompt...");
      perfPrev = await runBatchWithPrompt(prevPrompt.id);
      evidence.eval_run_id_Prev = perfPrev.evalRunId;
    }

    // 7. Generate candidates B, C
    prog("Generating candidate prompts...", 38);
    steps.push("Generating candidate prompts...");
    const { data: lastResults } = await supabase
      .from("ai_test_results")
      .select("validation_results")
      .order("created_at", { ascending: false })
      .limit(100);

    const categoryScores: Record<string, number[]> = {};
    for (const r of lastResults || []) {
      const vb = (r.validation_results as any)?.validatorBreakdown?.categoryScores;
      if (vb) {
        for (const [k, v] of Object.entries(vb)) {
          if (typeof v === "number") {
            if (!categoryScores[k]) categoryScores[k] = [];
            categoryScores[k].push(v);
          }
        }
      }
    }
    const avgByCat = Object.fromEntries(
      Object.entries(categoryScores).map(([k, arr]) => [k, arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 80])
    );
    const weakest = Object.entries(avgByCat).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([k, v]) => `${k}: ${Math.round(v)}%`).join("; ");

    const llmRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(
        prepareOpenAIBody({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Generate two improved prompt variants. Weakest categories: ${weakest}. Return JSON: { "variant_b": { "system_prompt": "full text", "rationale": "brief" }, "variant_c": { "system_prompt": "full text", "rationale": "brief" } }. B=target weak areas. C=clarity+constraint rewrite.`,
            },
            { role: "user", content: `Current prompt (first 2500 chars):\n${currentPrompt.system_prompt.slice(0, 2500)}` },
          ],
          max_completion_tokens: 8000,
          response_format: { type: "json_object" },
        } as Record<string, unknown>)
      ),
    });
    const llmData = await llmRes.json();
    const content = llmData.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LLM failed to generate candidates");
    }
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("Invalid LLM JSON");
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const { data: verB } = await admin
      .from("prompt_versions")
      .insert({
        kind: promptKind,
        version: `proposal-B-${ts}`,
        system_prompt: parsed.variant_b?.system_prompt || currentPrompt.system_prompt,
        meta: { source: "self-optimize-proposal", rationale: parsed.variant_b?.rationale },
        status: "candidate",
      })
      .select("id, version")
      .single();

    const { data: verC } = await admin
      .from("prompt_versions")
      .insert({
        kind: promptKind,
        version: `proposal-C-${ts}`,
        system_prompt: parsed.variant_c?.system_prompt || currentPrompt.system_prompt,
        meta: { source: "self-optimize-proposal", rationale: parsed.variant_c?.rationale },
        status: "candidate",
      })
      .select("id, version")
      .single();

    if (!verB || !verC) {
      throw new Error("Failed to create candidates");
    }
    const candidateIds = [verB.id, verC.id];

    // 8. Run batch with B and C
    prog("Running suite with candidate B...", 48);
    steps.push("Running suite with candidate B...");
    const perfB = await runBatchWithPrompt(verB.id);
    evidence.eval_run_id_B = perfB.evalRunId;
    prog("Running suite with candidate C...", 58);
    steps.push("Running suite with candidate C...");
    const perfC = await runBatchWithPrompt(verC.id);
    evidence.eval_run_id_C = perfC.evalRunId;

    // Restore current
    await setActivePromptVersion(promptKind, currentPrompt.id, currentPrompt.version);

    // 9. Run pairwise: A vs Prev, A vs B, A vs C (use suite IDs only - pairwise queries ai_test_cases)
    const pairwiseTests = suiteCaseList.map((c: any) => c.id).slice(0, 30);
    const runPairwise = async (promptAId: string, promptBId: string) => {
      const r = await fetch(`${baseUrl}/api/admin/ai-test/pairwise`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          test_case_ids: pairwiseTests,
          prompt_version_id_a: promptAId,
          prompt_version_id_b: promptBId,
          judge_mode,
          close_call_threshold,
        }),
      });
      return r.json();
    };

    const pairwiseResults: Record<string, any> = {};
    if (prevPrompt) {
      prog("Pairwise: Current vs Previous...", 65);
      steps.push("Pairwise: Current vs Previous...");
      const pwPrev = await runPairwise(currentPrompt.id, prevPrompt.id);
      pairwiseResults["A_vs_Prev"] = pwPrev;
      evidence.pairwise_A_vs_Prev = pwPrev.evalRunId;
    }
    prog("Pairwise: Current vs B...", 75);
    steps.push("Pairwise: Current vs B...");
    const pwB = await runPairwise(currentPrompt.id, verB.id);
    pairwiseResults["A_vs_B"] = pwB;
    evidence.pairwise_A_vs_B = pwB.evalRunId;
    prog("Pairwise: Current vs C...", 82);
    steps.push("Pairwise: Current vs C...");
    const pwC = await runPairwise(currentPrompt.id, verC.id);
    pairwiseResults["A_vs_C"] = pwC;
    evidence.pairwise_A_vs_C = pwC.evalRunId;

    // 10. Run Golden Set with each candidate (simplified: use batch on golden cases)
    const runGoldenWithPrompt = async (promptId: string): Promise<boolean> => {
      if (goldenCases.length === 0) return true;
      await setActivePromptVersion(promptKind, promptId);
      const r = await fetch(`${baseUrl}/api/admin/ai-test/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ testCases: goldenCases, formatKey: "commander" }),
      });
      const j = await r.json();
      const passed = j.results?.filter((x: any) => x.validation?.overall?.passed).length ?? 0;
      const total = j.results?.length ?? goldenCases.length;
      await setActivePromptVersion(promptKind, currentPrompt.id, currentPrompt.version);
      return total > 0 && passed === total;
    };

    prog("Running Golden Set checks...", 88);
    const goldenPassB = require_golden_pass ? await runGoldenWithPrompt(verB.id) : true;
    const goldenPassC = require_golden_pass ? await runGoldenWithPrompt(verC.id) : true;

    // 11. Compute recommendation
    const winRateB = pwB.summary?.winRateBByJudge ?? 0;
    const winRateC = pwC.summary?.winRateCByJudge ?? 0;
    const winRateDeltaB = winRateB - 50; // B's advantage over A (50 = tie)
    const winRateDeltaC = winRateC - 50;

    let recommendedId: string | null = null;
    let recommendation: "Adopt Candidate_B" | "Adopt Candidate_C" | "Keep Current" | "Needs Clarification" = "Keep Current";

    if (goldenPassB && winRateDeltaB >= 5 && (!recommendedId || winRateDeltaB >= winRateDeltaC)) {
      recommendedId = verB.id;
      recommendation = "Adopt Candidate_B";
    }
    if (goldenPassC && winRateDeltaC >= 5 && winRateDeltaC > (winRateDeltaB || 0)) {
      recommendedId = verC.id;
      recommendation = "Adopt Candidate_C";
    }
    if (!recommendedId && (winRateDeltaB >= 3 || winRateDeltaC >= 3)) {
      recommendation = "Needs Clarification";
    }

    const rationaleEli5 = [
      recommendation === "Keep Current" ? "No candidate met the threshold (Golden pass + 5% win rate)." : `Recommendation: ${recommendation}`,
      prevPrompt ? `Baseline drift: Current vs Previous compared.` : "No previous version for baseline.",
      `Deck samples: ${deckSampleCases.length} real deck analyses included.`,
      `Candidate B: ${perfB.passRate}% pass rate, Golden ${goldenPassB ? "PASS" : "FAIL"}.`,
      `Candidate C: ${perfC.passRate}% pass rate, Golden ${goldenPassC ? "PASS" : "FAIL"}.`,
    ].join("\n");

    const rationaleFull = `Self-optimization proposal. Current: ${currentPrompt.version}. Previous: ${prevPrompt?.version || "N/A"}. Candidates B (${verB.version}) and C (${verC.version}). Pairwise: A vs Prev, A vs B, A vs C. Golden Set: ${goldenSet?.name || "auto"}. Deck samples: ${deckSampleCases.length}. Recommendation: ${recommendation}.`;

    const diffSummary = {
      current_length: currentPrompt.system_prompt.length,
      B_length: parsed.variant_b?.system_prompt?.length ?? 0,
      C_length: parsed.variant_c?.system_prompt?.length ?? 0,
    };

    const riskAssessment = {
      cost_delta_pct: 0,
      latency_delta_pct: 0,
      confidence: recommendation === "Keep Current" ? 0.9 : 0.7,
      regression_risks: [] as string[],
    };

    // 12. Create proposal
    prog("Creating proposal...", 95);
    const { data: proposal, error: propErr } = await supabase
      .from("ai_prompt_change_proposals")
      .insert({
        created_by: user.email || user.id,
        status: "pending",
        kind: promptKind,
        active_prompt_version_id: currentPrompt.id,
        previous_prompt_version_id: prevPrompt?.id || null,
        candidate_prompt_version_ids: candidateIds,
        recommended_prompt_version_id: recommendedId,
        rationale_eli5: rationaleEli5,
        rationale_full: rationaleFull,
        diff_summary: diffSummary,
        evidence,
        risk_assessment: riskAssessment,
      })
      .select("id, status, rationale_eli5, rationale_full, diff_summary, evidence, risk_assessment, recommended_prompt_version_id, candidate_prompt_version_ids, active_prompt_version_id, previous_prompt_version_id, kind")
      .single();

    if (propErr) {
      throw new Error(propErr.message);
    }

    prog("Done", 100);
    return {
      ok: true,
      proposal_id: proposal.id,
      recommendation,
      recommended_prompt_version_id: recommendedId,
      summary: {
        rationale_eli5: rationaleEli5,
        golden_pass_B: goldenPassB,
        golden_pass_C: goldenPassC,
        pass_rate_A: perfA.passRate,
        pass_rate_B: perfB.passRate,
        pass_rate_C: perfC.passRate,
        win_rate_delta_B: winRateDeltaB,
        win_rate_delta_C: winRateDeltaC,
        pairwise_A_vs_Prev: prevPrompt ? pairwiseResults["A_vs_Prev"]?.summary : null,
        pairwise_A_vs_B: pairwiseResults["A_vs_B"]?.summary,
        pairwise_A_vs_C: pairwiseResults["A_vs_C"]?.summary,
        deck_sample_count: deckSampleCases.length,
      },
      steps,
      proposal,
    };
    };

    if (wantStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const enc = (o: object) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
          try {
            const result = await run((step, progress) => enc({ type: "progress", step, progress }));
            enc({ type: "complete", result });
          } catch (e: any) {
            const msg = e?.message || "server_error";
            const detail = e?.cause ? ` (cause: ${String(e.cause)})` : "";
            enc({ type: "error", error: `${msg}${detail}`, step: "stream" });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
      });
    }

    const result = await run(noop);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
