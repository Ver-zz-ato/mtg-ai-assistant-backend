import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

export const runtime = "nodejs";

// Verify cron key
function verifyCronKey(req: NextRequest): boolean {
  const cronKey = req.headers.get("x-cron-key");
  const expectedKey = process.env.CRON_SECRET_KEY || "Boobies";
  return cronKey === expectedKey;
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyCronKey(req)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const supabase = await getServerSupabase();
    const now = new Date();

    // Find schedules that need to run
    const { data: schedules, error: schedulesError } = await supabase
      .from("ai_test_schedules")
      .select("*")
      .eq("enabled", true)
      .lte("next_run_at", now.toISOString());

    if (schedulesError) {
      console.error("[cron/ai-test-run] Failed to load schedules:", schedulesError);
      return NextResponse.json({ ok: false, error: schedulesError.message }, { status: 500 });
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ ok: true, message: "No schedules to run", executed: 0 });
    }

    const baseUrl = req.url.split("/api/cron")[0];
    const executed: any[] = [];

    for (const schedule of schedules) {
      try {
        // Get test cases for this schedule
        let testCases: any[] = [];
        if (schedule.test_case_ids && schedule.test_case_ids.length > 0) {
          const { data: cases, error: casesError } = await supabase
            .from("ai_test_cases")
            .select("*")
            .in("id", schedule.test_case_ids);

          if (casesError) {
            console.error(`[cron/ai-test-run] Failed to load test cases for schedule ${schedule.id}:`, casesError);
            continue;
          }
          testCases = cases || [];
        } else {
          // Run all test cases
          const { data: allCases, error: allCasesError } = await supabase
            .from("ai_test_cases")
            .select("*");

          if (allCasesError) {
            console.error(`[cron/ai-test-run] Failed to load all test cases:`, allCasesError);
            continue;
          }
          testCases = allCases || [];
        }

        if (testCases.length === 0) {
          console.warn(`[cron/ai-test-run] No test cases to run for schedule ${schedule.id}`);
          continue;
        }

        // Run batch test
        const batchRes = await fetch(`${baseUrl}/api/admin/ai-test/batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: req.headers.get("cookie") || "",
          },
          body: JSON.stringify({
            testCases,
            suite: `scheduled-${schedule.name}-${now.toISOString().slice(0, 10)}`,
            validationOptions: schedule.validation_options || {},
          }),
        });

        const batchData = await batchRes.json();

        if (!batchData.ok) {
          console.error(`[cron/ai-test-run] Batch test failed for schedule ${schedule.id}:`, batchData.error);
          continue;
        }

        const passRate = batchData.summary?.passRate || 0;

        // Update schedule
        const nextRunAt = new Date();
        if (schedule.frequency === "daily") {
          nextRunAt.setDate(nextRunAt.getDate() + 1);
          nextRunAt.setHours(2, 0, 0, 0);
        } else if (schedule.frequency === "weekly") {
          nextRunAt.setDate(nextRunAt.getDate() + 7);
          nextRunAt.setHours(2, 0, 0, 0);
        } else {
          nextRunAt.setDate(nextRunAt.getDate() + 1);
        }

        await supabase
          .from("ai_test_schedules")
          .update({
            last_run_at: now.toISOString(),
            next_run_at: nextRunAt.toISOString(),
          })
          .eq("id", schedule.id);

        // Check if alert is needed
        const alertThreshold = schedule.alert_threshold ?? 70;
        const shouldAlert = passRate < alertThreshold;
        if (shouldAlert && schedule.alert_email) {
          // TODO: Send email alert
          console.warn(`[cron/ai-test-run] ALERT: Schedule "${schedule.name}" pass rate ${passRate}% is below threshold ${alertThreshold}%`);
        }

        // Webhook alert (Discord-compatible JSON)
        const webhookUrl = schedule.alert_webhook_url;
        const alertOnRegression = schedule.alert_on_regression !== false;
        if (shouldAlert && webhookUrl && typeof webhookUrl === "string" && webhookUrl.trim() && alertOnRegression) {
          try {
            const adminPageUrl = `${baseUrl.replace(/\/$/, "")}/admin/ai-test`;
            const payload = {
              content: null,
              embeds: [{
                title: "AI Test Regression Alert",
                description: `Schedule **${schedule.name}** pass rate dropped below threshold.`,
                color: 0xff0000,
                fields: [
                  { name: "Pass Rate", value: `${passRate}%`, inline: true },
                  { name: "Threshold", value: `${alertThreshold}%`, inline: true },
                  { name: "Tests", value: `${batchData.summary?.passed || 0}/${batchData.summary?.total || 0} passed`, inline: true },
                  { name: "Eval Run ID", value: batchData.evalRunId || "N/A", inline: false },
                  { name: "Admin", value: `[Open AI Test](${adminPageUrl})`, inline: false },
                ],
                timestamp: new Date().toISOString(),
              }],
            };
            await fetch(webhookUrl.trim(), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          } catch (webhookErr) {
            console.warn("[cron/ai-test-run] Webhook alert failed:", webhookErr);
          }
        }

        executed.push({
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          passRate,
          testCount: batchData.summary?.total || 0,
          passed: batchData.summary?.passed || 0,
          failed: batchData.summary?.failed || 0,
        });
      } catch (scheduleError: any) {
        console.error(`[cron/ai-test-run] Error executing schedule ${schedule.id}:`, scheduleError);
      }
    }

    return NextResponse.json({
      ok: true,
      executed: executed.length,
      results: executed,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}



