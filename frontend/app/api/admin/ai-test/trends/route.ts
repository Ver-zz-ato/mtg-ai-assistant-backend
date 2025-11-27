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
    const days = parseInt(url.searchParams.get("days") || "30");

    // Get eval runs from last N days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data: runs, error: runsError } = await supabase
      .from("eval_runs")
      .select(`
        id,
        suite,
        created_at,
        status,
        meta,
        ai_test_results (
          test_case_id,
          validation_results
        )
      `)
      .gte("created_at", cutoffDate.toISOString())
      .order("created_at", { ascending: true });

    if (runsError) {
      return NextResponse.json({ ok: false, error: runsError.message }, { status: 500 });
    }

    // Get all test cases with tags
    const { data: testCases, error: casesError } = await supabase
      .from("ai_test_cases")
      .select("id, name, type, tags");

    if (casesError) {
      console.warn("Failed to load test cases for trends:", casesError);
    }

    const testCaseMap = new Map();
    (testCases || []).forEach((tc: any) => {
      testCaseMap.set(tc.id, tc);
    });

    // Calculate trends by date
    const trendsByDate: Record<string, {
      date: string;
      total: number;
      passed: number;
      failed: number;
      passRate: number;
    }> = {};

    // Calculate trends by category (tag)
    const trendsByCategory: Record<string, {
      category: string;
      total: number;
      passed: number;
      failed: number;
      passRate: number;
      trend: "improving" | "declining" | "stable";
    }> = {};

    // Process each run
    (runs || []).forEach((run: any) => {
      const date = new Date(run.created_at).toISOString().split("T")[0];
      
      if (!trendsByDate[date]) {
        trendsByDate[date] = {
          date,
          total: 0,
          passed: 0,
          failed: 0,
          passRate: 0,
        };
      }

      const results = run.ai_test_results || [];
      results.forEach((result: any) => {
        const passed = result.validation_results?.overall?.passed === true;
        trendsByDate[date].total++;
        if (passed) {
          trendsByDate[date].passed++;
        } else {
          trendsByDate[date].failed++;
        }

        // Track by category
        const testCase = testCaseMap.get(result.test_case_id);
        if (testCase && testCase.tags) {
          testCase.tags.forEach((tag: string) => {
            if (!trendsByCategory[tag]) {
              trendsByCategory[tag] = {
                category: tag,
                total: 0,
                passed: 0,
                failed: 0,
                passRate: 0,
                trend: "stable",
              };
            }
            trendsByCategory[tag].total++;
            if (passed) {
              trendsByCategory[tag].passed++;
            } else {
              trendsByCategory[tag].failed++;
            }
          });
        }
      });
    });

    // Calculate pass rates
    Object.values(trendsByDate).forEach((trend) => {
      trend.passRate = trend.total > 0 ? Math.round((trend.passed / trend.total) * 100) : 0;
    });

    Object.values(trendsByCategory).forEach((trend) => {
      trend.passRate = trend.total > 0 ? Math.round((trend.passed / trend.total) * 100) : 0;
    });

    // Determine trends (improving/declining) for categories
    const categoryHistory: Record<string, number[]> = {};
    
    (runs || []).forEach((run: any) => {
      const results = run.ai_test_results || [];
      const categoryPassRates: Record<string, { passed: number; total: number }> = {};

      results.forEach((result: any) => {
        const testCase = testCaseMap.get(result.test_case_id);
        if (testCase && testCase.tags) {
          const passed = result.validation_results?.overall?.passed === true;
          testCase.tags.forEach((tag: string) => {
            if (!categoryPassRates[tag]) {
              categoryPassRates[tag] = { passed: 0, total: 0 };
            }
            categoryPassRates[tag].total++;
            if (passed) {
              categoryPassRates[tag].passed++;
            }
          });
        }
      });

      Object.entries(categoryPassRates).forEach(([tag, stats]) => {
        if (!categoryHistory[tag]) {
          categoryHistory[tag] = [];
        }
        const passRate = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
        categoryHistory[tag].push(passRate);
      });
    });

    // Calculate trend direction
    Object.keys(trendsByCategory).forEach((tag) => {
      const history = categoryHistory[tag] || [];
      if (history.length >= 3) {
        const recent = history.slice(-3);
        const older = history.slice(0, -3);
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
        
        if (recentAvg > olderAvg + 5) {
          trendsByCategory[tag].trend = "improving";
        } else if (recentAvg < olderAvg - 5) {
          trendsByCategory[tag].trend = "declining";
        } else {
          trendsByCategory[tag].trend = "stable";
        }
      }
    });

    // Overall trend
    const dateTrends = Object.values(trendsByDate).sort((a, b) => a.date.localeCompare(b.date));
    const overallTrend = dateTrends.length >= 2
      ? dateTrends[dateTrends.length - 1].passRate - dateTrends[0].passRate
      : 0;

    // Failure pattern clustering (which categories fail together)
    const failurePatterns: Record<string, string[]> = {};
    (runs || []).forEach((run: any) => {
      const results = run.ai_test_results || [];
      const failedCategories = new Set<string>();
      
      results.forEach((result: any) => {
        const passed = result.validation_results?.overall?.passed === true;
        if (!passed) {
          const testCase = testCaseMap.get(result.test_case_id);
          if (testCase && testCase.tags) {
            testCase.tags.forEach((tag: string) => failedCategories.add(tag));
          }
        }
      });

      if (failedCategories.size > 0) {
        const patternKey = Array.from(failedCategories).sort().join(",");
        if (!failurePatterns[patternKey]) {
          failurePatterns[patternKey] = [];
        }
        failurePatterns[patternKey].push(run.id);
      }
    });

    return NextResponse.json({
      ok: true,
      trends: {
        byDate: dateTrends,
        byCategory: Object.values(trendsByCategory).sort((a, b) => b.total - a.total),
        overallTrend,
        failurePatterns: Object.entries(failurePatterns)
          .map(([pattern, runIds]) => ({
            categories: pattern.split(","),
            frequency: runIds.length,
            runIds,
          }))
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, 10), // Top 10 patterns
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

