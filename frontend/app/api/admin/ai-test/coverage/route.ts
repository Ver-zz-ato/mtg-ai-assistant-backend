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

    // Get all test cases with their tags
    const { data: testCases, error: casesError } = await supabase
      .from("ai_test_cases")
      .select("id, name, type, tags");

    if (casesError) {
      console.warn("Failed to load test cases for coverage:", casesError);
    }

    // Get latest test results
    const { data: latestRun, error: runError } = await supabase
      .from("eval_runs")
      .select(`
        id,
        created_at,
        meta,
        ai_test_results (
          test_case_id,
          validation_results
        )
      `)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runError) {
      console.warn("Failed to load latest run for coverage:", runError);
    }

    // Calculate coverage by category
    const allTags = new Set<string>();
    const allTypes = new Set<string>();
    (testCases || []).forEach((tc: any) => {
      tc.tags?.forEach((tag: string) => allTags.add(tag));
      if (tc.type) allTypes.add(tc.type);
    });

    const coverageByTag: Record<string, { total: number; passed: number; failed: number; untested: number }> = {};
    const coverageByType: Record<string, { total: number; passed: number; failed: number; untested: number }> = {};

    // Initialize coverage
    allTags.forEach((tag) => {
      coverageByTag[tag] = { total: 0, passed: 0, failed: 0, untested: 0 };
    });
    allTypes.forEach((type) => {
      coverageByType[type] = { total: 0, passed: 0, failed: 0, untested: 0 };
    });

    // Count tests by category
    const resultsMap = new Map();
    (latestRun?.ai_test_results || []).forEach((result: any) => {
      resultsMap.set(result.test_case_id, result.validation_results);
    });

    (testCases || []).forEach((tc: any) => {
      const result = resultsMap.get(tc.id);
      const passed = result?.overall?.passed === true;
      const failed = result?.overall?.passed === false;
      const untested = !result;

      // Count by tags
      tc.tags?.forEach((tag: string) => {
        if (coverageByTag[tag]) {
          coverageByTag[tag].total++;
          if (passed) coverageByTag[tag].passed++;
          else if (failed) coverageByTag[tag].failed++;
          else coverageByTag[tag].untested++;
        }
      });

      // Count by type
      if (tc.type && coverageByType[tc.type]) {
        coverageByType[tc.type].total++;
        if (passed) coverageByType[tc.type].passed++;
        else if (failed) coverageByType[tc.type].failed++;
        else coverageByType[tc.type].untested++;
      }
    });

    // Calculate overall stats
    const totalTests = testCases?.length || 0;
    const testedTests = latestRun?.ai_test_results?.length || 0;
    const passedTests = (latestRun?.ai_test_results || []).filter(
      (r: any) => r.validation_results?.overall?.passed === true
    ).length;
    const failedTests = (latestRun?.ai_test_results || []).filter(
      (r: any) => r.validation_results?.overall?.passed === false
    ).length;

    return NextResponse.json({
      ok: true,
      coverage: {
        overall: {
          total: totalTests,
          tested: testedTests,
          passed: passedTests,
          failed: failedTests,
          untested: totalTests - testedTests,
          passRate: testedTests > 0 ? Math.round((passedTests / testedTests) * 100) : 0,
        },
        byTag: coverageByTag,
        byType: coverageByType,
        latestRunId: latestRun?.id,
        latestRunDate: latestRun?.created_at,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

