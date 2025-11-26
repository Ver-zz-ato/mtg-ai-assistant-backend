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
 * POST /api/admin/ai-test/compare-runs
 * Compare two eval runs and return categorized results
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { runAId, runBId } = body;

    if (!runAId || !runBId) {
      return NextResponse.json({ ok: false, error: "runAId and runBId required" }, { status: 400 });
    }

    // Load both eval runs
    const { data: runA, error: runAError } = await supabase
      .from("eval_runs")
      .select("*")
      .eq("id", runAId)
      .single();

    const { data: runB, error: runBError } = await supabase
      .from("eval_runs")
      .select("*")
      .eq("id", runBId)
      .single();

    if (runAError || runBError || !runA || !runB) {
      return NextResponse.json(
        { ok: false, error: `Failed to load runs: ${runAError?.message || runBError?.message}` },
        { status: 500 }
      );
    }

    // Load test results for both runs, joined with test cases
    const { data: resultsA, error: resultsAError } = await supabase
      .from("ai_test_results")
      .select("*, ai_test_cases(*)")
      .eq("eval_run_id", runAId);

    const { data: resultsB, error: resultsBError } = await supabase
      .from("ai_test_results")
      .select("*, ai_test_cases(*)")
      .eq("eval_run_id", runBId);

    if (resultsAError || resultsBError) {
      return NextResponse.json(
        { ok: false, error: `Failed to load results: ${resultsAError?.message || resultsBError?.message}` },
        { status: 500 }
      );
    }

    // Create maps by test_case_id for comparison
    const mapA = new Map<string, any>();
    const mapB = new Map<string, any>();

    resultsA?.forEach((r: any) => {
      const testCaseId = r.test_case_id;
      if (testCaseId) {
        mapA.set(testCaseId, r);
      }
    });

    resultsB?.forEach((r: any) => {
      const testCaseId = r.test_case_id;
      if (testCaseId) {
        mapB.set(testCaseId, r);
      }
    });

    // Categorize tests
    const allTestCaseIds = new Set([...mapA.keys(), ...mapB.keys()]);
    const categorized: {
      regression: any[];
      improved: any[];
      unchangedFailed: any[];
      unchangedPassed: any[];
    } = {
      regression: [],
      improved: [],
      unchangedFailed: [],
      unchangedPassed: [],
    };

    const getPassed = (result: any): boolean => {
      return result?.validation_results?.overall?.passed === true;
    };

    allTestCaseIds.forEach((testCaseId) => {
      const resultA = mapA.get(testCaseId);
      const resultB = mapB.get(testCaseId);
      const testCase = resultA?.ai_test_cases || resultB?.ai_test_cases;

      if (!testCase) return;

      const passedA = resultA ? getPassed(resultA) : null;
      const passedB = resultB ? getPassed(resultB) : null;

      const entry = {
        testCaseId,
        testCase: {
          id: testCase.id,
          name: testCase.name,
          type: testCase.type,
        },
        resultA: resultA
          ? {
              passed: passedA,
              judge: resultA.validation_results?.judge,
            }
          : null,
        resultB: resultB
          ? {
              passed: passedB,
              judge: resultB.validation_results?.judge,
            }
          : null,
      };

      if (passedA === true && passedB === false) {
        categorized.regression.push(entry);
      } else if (passedA === false && passedB === true) {
        categorized.improved.push(entry);
      } else if (passedA === false && passedB === false) {
        categorized.unchangedFailed.push(entry);
      } else if (passedA === true && passedB === true) {
        categorized.unchangedPassed.push(entry);
      }
    });

    // Calculate pass rates
    const passRateA = runA.meta?.pass_rate || 0;
    const passRateB = runB.meta?.pass_rate || 0;

    return NextResponse.json({
      ok: true,
      runA: {
        id: runA.id,
        suite: runA.suite,
        created_at: runA.created_at,
        passRate: passRateA,
        meta: runA.meta,
      },
      runB: {
        id: runB.id,
        suite: runB.suite,
        created_at: runB.created_at,
        passRate: passRateB,
        meta: runB.meta,
      },
      comparison: {
        passRateA,
        passRateB,
        change: passRateB - passRateA,
        categorized,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}





