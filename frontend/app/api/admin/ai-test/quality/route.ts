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
 * Calculate quality score for a test case
 * Formula: (catch_count * 10) + (recent_pass_rate * 50) - (flakiness * 20)
 * Where flakiness = 100 - consistency_score
 */
function calculateQualityScore(
  catchCount: number,
  passCount: number,
  runCount: number,
  consistencyScore: number
): number {
  const recentPassRate = runCount > 0 ? (passCount / runCount) * 100 : 0;
  const flakiness = 100 - (consistencyScore || 100);
  
  const score = (catchCount * 10) + (recentPassRate * 50) - (flakiness * 20);
  return Math.max(0, Math.min(1000, score)); // Clamp between 0 and 1000
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const update = url.searchParams.get("update") === "true";

    if (update) {
      // Update quality scores for all test cases
      const { data: testCases, error: casesError } = await supabase
        .from("ai_test_cases")
        .select("id, catch_count, pass_count, run_count, consistency_score");

      if (casesError) {
        return NextResponse.json({ ok: false, error: casesError.message }, { status: 500 });
      }

      // Update each test case's quality score
      const updates = (testCases || []).map((tc: any) => {
        const qualityScore = calculateQualityScore(
          tc.catch_count || 0,
          tc.pass_count || 0,
          tc.run_count || 0,
          tc.consistency_score || 100
        );

        const failureRate = tc.run_count > 0 
          ? ((tc.run_count - (tc.pass_count || 0)) / tc.run_count) * 100 
          : 0;

        return supabase
          .from("ai_test_cases")
          .update({
            quality_score: qualityScore,
            failure_rate: failureRate,
          })
          .eq("id", tc.id);
      });

      await Promise.all(updates);
    }

    // Get test cases sorted by quality score
    const { data: testCases, error } = await supabase
      .from("ai_test_cases")
      .select("id, name, type, quality_score, catch_count, failure_rate, consistency_score, run_count, pass_count")
      .order("quality_score", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Calculate statistics
    const stats = {
      total: testCases?.length || 0,
      highValue: testCases?.filter((tc: any) => (tc.catch_count || 0) >= 3).length || 0,
      lowValue: testCases?.filter((tc: any) => (tc.quality_score || 0) < 20).length || 0,
      averageQuality: testCases?.length > 0
        ? testCases.reduce((sum: number, tc: any) => sum + (tc.quality_score || 0), 0) / testCases.length
        : 0,
    };

    return NextResponse.json({
      ok: true,
      testCases: testCases || [],
      stats,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { testCaseId, catchCount, passed, consistencyScore } = body;

    if (!testCaseId) {
      return NextResponse.json({ ok: false, error: "testCaseId required" }, { status: 400 });
    }

    // Get current test case stats
    const { data: testCase, error: fetchError } = await supabase
      .from("ai_test_cases")
      .select("catch_count, pass_count, run_count, consistency_score, last_passed_at")
      .eq("id", testCaseId)
      .single();

    if (fetchError || !testCase) {
      return NextResponse.json({ ok: false, error: "Test case not found" }, { status: 404 });
    }

    // Update stats
    const updates: any = {
      run_count: (testCase.run_count || 0) + 1,
    };

    if (passed) {
      updates.pass_count = (testCase.pass_count || 0) + 1;
      updates.last_passed_at = new Date().toISOString();
    } else {
      // Test failed - increment catch_count if this is a new failure pattern
      if (catchCount !== undefined) {
        updates.catch_count = Math.max(testCase.catch_count || 0, catchCount);
      }
    }

    if (consistencyScore !== undefined) {
      updates.consistency_score = consistencyScore;
    }

    // Calculate new quality score
    const newQualityScore = calculateQualityScore(
      updates.catch_count || testCase.catch_count || 0,
      updates.pass_count || testCase.pass_count || 0,
      updates.run_count,
      updates.consistency_score || testCase.consistency_score || 100
    );

    updates.quality_score = newQualityScore;
    updates.failure_rate = updates.run_count > 0
      ? ((updates.run_count - (updates.pass_count || 0)) / updates.run_count) * 100
      : 0;

    const { error: updateError } = await supabase
      .from("ai_test_cases")
      .update(updates)
      .eq("id", testCaseId);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      qualityScore: newQualityScore,
      updated: updates,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}



