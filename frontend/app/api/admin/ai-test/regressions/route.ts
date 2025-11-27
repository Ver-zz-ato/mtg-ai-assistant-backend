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

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const runId = url.searchParams.get("runId");

    if (!runId) {
      return NextResponse.json({ ok: false, error: "runId required" }, { status: 400 });
    }

    // Get the specified run and the previous run
    const { data: currentRun, error: currentError } = await supabase
      .from("eval_runs")
      .select(`
        id,
        suite,
        created_at,
        meta,
        ai_test_results (
          test_case_id,
          validation_results
        )
      `)
      .eq("id", runId)
      .single();

    if (currentError || !currentRun) {
      return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
    }

    // Get previous run (before this one)
    const { data: previousRun, error: prevError } = await supabase
      .from("eval_runs")
      .select(`
        id,
        suite,
        created_at,
        meta,
        ai_test_results (
          test_case_id,
          validation_results
        )
      `)
      .lt("created_at", currentRun.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (prevError) {
      console.warn("Failed to load previous run:", prevError);
    }

    if (!previousRun) {
      return NextResponse.json({
        ok: true,
        regressions: [],
        improvements: [],
        unchanged: [],
        message: "No previous run found for comparison",
      });
    }

    // Build result maps
    const currentResults = new Map();
    (currentRun.ai_test_results || []).forEach((result: any) => {
      currentResults.set(result.test_case_id, result.validation_results);
    });

    const previousResults = new Map();
    (previousRun.ai_test_results || []).forEach((result: any) => {
      previousResults.set(result.test_case_id, result.validation_results);
    });

    // Find regressions (was passing, now failing)
    const regressions: any[] = [];
    const improvements: any[] = [];
    const unchanged: any[] = [];

    currentResults.forEach((currentVal, testCaseId) => {
      const previousVal = previousResults.get(testCaseId);
      if (!previousVal) return; // New test, skip

      const currentPassed = currentVal?.overall?.passed === true;
      const previousPassed = previousVal?.overall?.passed === true;
      const currentScore = currentVal?.overall?.score || 0;
      const previousScore = previousVal?.overall?.score || 0;

      if (previousPassed && !currentPassed) {
        regressions.push({
          testCaseId,
          previousScore,
          currentScore,
          previousResult: previousVal,
          currentResult: currentVal,
        });
      } else if (!previousPassed && currentPassed) {
        improvements.push({
          testCaseId,
          previousScore,
          currentScore,
          previousResult: previousVal,
          currentResult: currentVal,
        });
      } else if (previousPassed === currentPassed) {
        unchanged.push({
          testCaseId,
          previousScore,
          currentScore,
          passed: currentPassed,
        });
      }
    });

    return NextResponse.json({
      ok: true,
      regressions,
      improvements,
      unchanged,
      currentRun: {
        id: currentRun.id,
        suite: currentRun.suite,
        createdAt: currentRun.created_at,
        passRate: currentRun.meta?.pass_rate || 0,
      },
      previousRun: {
        id: previousRun.id,
        suite: previousRun.suite,
        createdAt: previousRun.created_at,
        passRate: previousRun.meta?.pass_rate || 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}



