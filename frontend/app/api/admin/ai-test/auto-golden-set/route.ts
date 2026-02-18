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

function hasTag(tc: any, ...tags: string[]): boolean {
  const t = (tc.tags || []).map((x: string) => String(x).toLowerCase());
  return tags.some((tag) => t.some((x: string) => x.includes(tag.toLowerCase())));
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    // 1. Load all test cases from DB
    const { data: dbCases, error: casesError } = await supabase
      .from("ai_test_cases")
      .select("id, name, type, tags");

    if (casesError || !dbCases?.length) {
      return NextResponse.json({ ok: false, error: "No test cases in database. Import tests first." }, { status: 400 });
    }

    // 2. Get pass/fail history from ai_test_results (aggregate by test_case_id)
    const { data: results } = await supabase
      .from("ai_test_results")
      .select("test_case_id, validation_results");

    const passRateByCase: Record<string, { pass: number; total: number }> = {};
    const hallucinationByCase: Record<string, number> = {};
    for (const r of results || []) {
      const tid = r.test_case_id;
      if (!tid) continue;
      if (!passRateByCase[tid]) passRateByCase[tid] = { pass: 0, total: 0 };
      passRateByCase[tid].total++;
      const passed = (r.validation_results as any)?.overall?.passed === true;
      if (passed) passRateByCase[tid].pass++;
      const vb = (r.validation_results as any)?.validatorBreakdown;
      if (vb?.flags?.hallucinationRisk) {
        hallucinationByCase[tid] = (hallucinationByCase[tid] || 0) + 1;
      }
    }

    // 3. Score each case: lower pass rate = harder; more hallucinations = harder
    const scored = dbCases.map((tc: any) => {
      const stats = passRateByCase[tc.id];
      const passRate = stats && stats.total > 0 ? (stats.pass / stats.total) * 100 : 50;
      const hallCount = hallucinationByCase[tc.id] || 0;
      const disagreement = 0; // Would need pairwise data
      const score = 100 - passRate + hallCount * 5 + disagreement * 0.5;
      return { ...tc, passRate, hallCount, score };
    });

    // 4. Take hardest 20%
    const n = Math.max(10, Math.ceil(scored.length * 0.2));
    const hardest = [...scored].sort((a, b) => b.score - a.score).slice(0, n);

    // 5. Ensure coverage: min 3 deck_analysis, 2 legality, 2 budget, 1 clarification
    const deckAnalysis = hardest.filter((c: any) => c.type === "deck_analysis");
    const legality = hardest.filter((c: any) => hasTag(c, "legality", "format", "illegal"));
    const budget = hardest.filter((c: any) => hasTag(c, "budget", "price", "cost", "cheap"));
    const clarification = hardest.filter((c: any) => hasTag(c, "clarification", "missing_info", "clarifying"));

    const selected = new Set<string>(hardest.map((c: any) => c.id));
    const addIfMissing = (arr: any[], min: number, label: string) => {
      const need = min - Math.min(min, arr.length);
      if (need <= 0) return;
      const pool = dbCases.filter((c: any) => !selected.has(c.id) && (label === "deck" ? c.type === "deck_analysis" : label === "legality" ? hasTag(c, "legality", "format", "illegal") : label === "budget" ? hasTag(c, "budget", "price", "cost", "cheap") : hasTag(c, "clarification", "missing_info", "clarifying")));
      for (let i = 0; i < need && pool[i]; i++) {
        selected.add(pool[i].id);
      }
    };
    addIfMissing(deckAnalysis, 3, "deck");
    addIfMissing(legality, 2, "legality");
    addIfMissing(budget, 2, "budget");
    addIfMissing(clarification, 1, "clarification");

    const testCaseIds = Array.from(selected);

    // 6. Create Golden Set
    const dateStr = new Date().toISOString().slice(0, 10);
    const name = `Auto-Golden-${dateStr}`;

    const { data: existing } = await supabase.from("ai_eval_sets").select("id").eq("name", name).maybeSingle();
    if (existing) {
      await supabase
        .from("ai_eval_sets")
        .update({
          test_case_ids: testCaseIds,
          min_overall_score: 85,
          max_critical_violations: 0,
          min_specificity_score: 75,
          min_actionability_score: 75,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      const { data: updated } = await supabase.from("ai_eval_sets").select("*").eq("id", existing.id).single();
      return NextResponse.json({
        ok: true,
        set: updated,
        created: false,
        message: `Updated existing Golden Set "${name}" with ${testCaseIds.length} tests`,
      });
    }

    const { data: set, error: insertError } = await supabase
      .from("ai_eval_sets")
      .insert({
        name,
        description: `Auto-generated from hardest 20% of tests (${dateStr})`,
        type: "mixed",
        test_case_ids: testCaseIds,
        strict: true,
        min_overall_score: 85,
        require_critical_violations_zero: true,
        max_critical_violations: 0,
        max_total_violations: 2,
        min_specificity_score: 75,
        min_actionability_score: 75,
        min_format_legality_score: 90,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      set,
      created: true,
      message: `Created Golden Set "${name}" with ${testCaseIds.length} tests`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
