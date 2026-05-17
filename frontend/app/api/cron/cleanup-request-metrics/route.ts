import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { verifyCronRequest } from "@/lib/server/verifyCronRequest";

export const maxDuration = 60; // 1 minute

/**
 * Cleanup old request_metrics records (older than 14 days).
 * Add to vercel.json crons to run weekly.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req, { routePath: "/api/cron/cleanup-request-metrics" })) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }

  try {
    const retentionDays = parseInt(process.env.BILLING_METRICS_RETENTION_DAYS || "14", 10);
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const { count: toDeleteCount } = await admin
      .from("request_metrics")
      .select("*", { count: "exact", head: true })
      .lt("ts", cutoff);

    const { error } = await admin.from("request_metrics").delete().lt("ts", cutoff);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    try {
      await admin.from("admin_audit").insert({
        actor_id: "cron",
        action: "cleanup_request_metrics",
        target: `deleted_older_than_${retentionDays}_days`,
        payload: { deleted_count: toDeleteCount, cutoff },
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      deleted_count: toDeleteCount,
      retention_days: retentionDays,
      cutoff,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}
