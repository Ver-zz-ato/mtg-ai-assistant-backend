import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { markAdminJobAttempt, persistAdminJobRun } from "@/lib/admin/adminJobRunLog";
import { runOpsReport } from "@/lib/ops/run-ops-report";
import { verifyCronRequest } from "@/lib/server/verifyCronRequest";

export const runtime = "nodejs";
export const maxDuration = 60;
const JOB_ID = "weekly_ops_report";

export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req, { routePath: "/api/cron/ops-report/weekly" })) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }

  const attemptStartedAt = new Date().toISOString();
  await markAdminJobAttempt(admin, JOB_ID);

  try {
    const result = await runOpsReport("weekly_ops");
    const finishedAt = new Date().toISOString();
    const detail = {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt,
      ok: result.ok,
      runResult: result.ok ? "success" as const : "failed" as const,
      compactLine: `${result.report_type}: ${result.status.toUpperCase()} - ${result.summary}`,
      destination: "ops_reports + Discord",
      source: "runOpsReport(weekly_ops)",
      durationMs: result.duration_ms,
      labels: {
        schedule: "Weekly Sunday 07:00 UTC",
        discord: "Delivery is handled by runOpsReport when configured",
      },
      extra: {
        report_id: result.report_id,
        report_status: result.status,
        report_type: result.report_type,
      },
      notes: "Discord delivery status is not returned by runOpsReport; this route records report generation and the delegated Discord send attempt.",
    };
    await persistAdminJobRun(admin, JOB_ID, detail, { updateLastSuccess: result.ok });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "ops_report_failed";
    const finishedAt = new Date().toISOString();
    await persistAdminJobRun(admin, JOB_ID, {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt,
      ok: false,
      runResult: "failed",
      compactLine: `Failed: ${message.slice(0, 180)}`,
      destination: "ops_reports + Discord",
      source: "runOpsReport(weekly_ops)",
      lastError: message,
    }, { updateLastSuccess: false });
    console.error("[ops-report:weekly]", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
