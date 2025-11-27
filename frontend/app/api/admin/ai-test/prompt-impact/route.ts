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
    const promptVersionId = url.searchParams.get("promptVersionId");

    if (!promptVersionId) {
      return NextResponse.json({ ok: false, error: "promptVersionId required" }, { status: 400 });
    }

    // Get the specified prompt version
    const { data: promptVersion, error: versionError } = await supabase
      .from("prompt_versions")
      .select("id, version, created_at, kind")
      .eq("id", promptVersionId)
      .single();

    if (versionError || !promptVersion) {
      return NextResponse.json({ ok: false, error: "Prompt version not found" }, { status: 404 });
    }

    // Get eval runs before and after this prompt version
    const { data: runsBefore, error: beforeError } = await supabase
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
      .lt("created_at", promptVersion.created_at)
      .order("created_at", { ascending: false })
      .limit(5);

    const { data: runsAfter, error: afterError } = await supabase
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
      .gte("created_at", promptVersion.created_at)
      .order("created_at", { ascending: true })
      .limit(5);

    if (beforeError || afterError) {
      console.warn("Error loading runs:", beforeError || afterError);
    }

    // Get test cases with tags for categorization
    const { data: testCases, error: casesError } = await supabase
      .from("ai_test_cases")
      .select("id, name, type, tags");

    if (casesError) {
      console.warn("Failed to load test cases:", casesError);
    }

    const testCaseMap = new Map();
    (testCases || []).forEach((tc: any) => {
      testCaseMap.set(tc.id, tc);
    });

    // Build result maps
    const beforeResults = new Map<string, { passed: boolean; score: number }>();
    const afterResults = new Map<string, { passed: boolean; score: number }>();

    (runsBefore || []).forEach((run: any) => {
      (run.ai_test_results || []).forEach((result: any) => {
        const testCaseId = result.test_case_id;
        const passed = result.validation_results?.overall?.passed === true;
        const score = result.validation_results?.overall?.score || 0;
        
        // Keep the most recent result for each test
        if (!beforeResults.has(testCaseId)) {
          beforeResults.set(testCaseId, { passed, score });
        }
      });
    });

    (runsAfter || []).forEach((run: any) => {
      (run.ai_test_results || []).forEach((result: any) => {
        const testCaseId = result.test_case_id;
        const passed = result.validation_results?.overall?.passed === true;
        const score = result.validation_results?.overall?.score || 0;
        
        // Keep the most recent result for each test
        if (!afterResults.has(testCaseId)) {
          afterResults.set(testCaseId, { passed, score });
        }
      });
    });

    // Calculate impact
    const improved: any[] = [];
    const regressed: any[] = [];
    const unchanged: any[] = [];
    const newTests: any[] = [];
    const removedTests: any[] = [];

    // Check tests that exist in both
    beforeResults.forEach((before, testCaseId) => {
      const after = afterResults.get(testCaseId);
      const testCase = testCaseMap.get(testCaseId);

      if (!after) {
        removedTests.push({
          testCaseId,
          testCase: testCase || { name: "Unknown", tags: [] },
          before,
        });
        return;
      }

      if (before.passed && !after.passed) {
        regressed.push({
          testCaseId,
          testCase: testCase || { name: "Unknown", tags: [] },
          before,
          after,
          scoreChange: after.score - before.score,
        });
      } else if (!before.passed && after.passed) {
        improved.push({
          testCaseId,
          testCase: testCase || { name: "Unknown", tags: [] },
          before,
          after,
          scoreChange: after.score - before.score,
        });
      } else if (before.passed === after.passed) {
        const scoreChange = after.score - before.score;
        if (Math.abs(scoreChange) > 5) {
          if (scoreChange > 0) {
            improved.push({
              testCaseId,
              testCase: testCase || { name: "Unknown", tags: [] },
              before,
              after,
              scoreChange,
            });
          } else {
            regressed.push({
              testCaseId,
              testCase: testCase || { name: "Unknown", tags: [] },
              before,
              after,
              scoreChange,
            });
          }
        } else {
          unchanged.push({
            testCaseId,
            testCase: testCase || { name: "Unknown", tags: [] },
            before,
            after,
          });
        }
      }
    });

    // Check new tests (only in after)
    afterResults.forEach((after, testCaseId) => {
      if (!beforeResults.has(testCaseId)) {
        const testCase = testCaseMap.get(testCaseId);
        newTests.push({
          testCaseId,
          testCase: testCase || { name: "Unknown", tags: [] },
          after,
        });
      }
    });

    // Calculate impact by category
    const impactByCategory: Record<string, {
      improved: number;
      regressed: number;
      unchanged: number;
      netChange: number;
    }> = {};

    const categorize = (items: any[], type: "improved" | "regressed" | "unchanged") => {
      items.forEach((item) => {
        const tags = item.testCase?.tags || [];
        tags.forEach((tag: string) => {
          if (!impactByCategory[tag]) {
            impactByCategory[tag] = { improved: 0, regressed: 0, unchanged: 0, netChange: 0 };
          }
          impactByCategory[tag][type]++;
          if (type === "improved") {
            impactByCategory[tag].netChange++;
          } else if (type === "regressed") {
            impactByCategory[tag].netChange--;
          }
        });
      });
    };

    categorize(improved, "improved");
    categorize(regressed, "regressed");
    categorize(unchanged, "unchanged");

    // Calculate overall stats
    const beforePassRate = beforeResults.size > 0
      ? (Array.from(beforeResults.values()).filter(r => r.passed).length / beforeResults.size) * 100
      : 0;

    const afterPassRate = afterResults.size > 0
      ? (Array.from(afterResults.values()).filter(r => r.passed).length / afterResults.size) * 100
      : 0;

    return NextResponse.json({
      ok: true,
      promptVersion: {
        id: promptVersion.id,
        version: promptVersion.version,
        createdAt: promptVersion.created_at,
        kind: promptVersion.kind,
      },
      impact: {
        improved: improved.length,
        regressed: regressed.length,
        unchanged: unchanged.length,
        newTests: newTests.length,
        removedTests: removedTests.length,
        passRateChange: afterPassRate - beforePassRate,
        beforePassRate: Math.round(beforePassRate),
        afterPassRate: Math.round(afterPassRate),
      },
      details: {
        improved: improved.slice(0, 20),
        regressed: regressed.slice(0, 20),
        unchanged: unchanged.slice(0, 10),
        newTests: newTests.slice(0, 10),
        removedTests: removedTests.slice(0, 10),
      },
      byCategory: impactByCategory,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

