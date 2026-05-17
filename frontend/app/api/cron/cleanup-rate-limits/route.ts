import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { verifyCronRequest } from "@/lib/server/verifyCronRequest";

export const runtime = "nodejs";
export const maxDuration = 60; // 1 minute

/**
 * Cleanup old rate limit records.
 * Runs weekly via Vercel cron to remove old api_usage_rate_limits records.
 */
async function handleCleanup(req: NextRequest) {
  console.log("[cleanup-rate-limits] started");

  try {
    if (!verifyCronRequest(req, { routePath: "/api/cron/cleanup-rate-limits" })) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const retentionDaysParam = req.nextUrl.searchParams.get("days") || "30";
    const retentionDays = parseInt(retentionDaysParam, 10) || 30;

    const admin = getAdmin();
    if (!admin) {
      throw new Error("Admin client not available");
    }

    const { data, error } = await admin.rpc("cleanup_old_rate_limits", {
      retention_days: retentionDays,
    });

    if (error) {
      throw new Error(`Cleanup failed: ${error.message}`);
    }

    const result = Array.isArray(data) && data.length > 0 ? data[0] : null;
    const deletedCount = result?.deleted_count || 0;

    console.log("[cleanup-rate-limits] completed", {
      deletedCount,
      retentionDays,
    });

    return NextResponse.json({
      ok: true,
      deleted: deletedCount,
      retention_days: retentionDays,
      cutoff_date: result?.cutoff_date,
      message: result?.message || "Rate limits cleanup completed",
    });
  } catch (error: any) {
    console.error("[cleanup-rate-limits] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "cleanup_failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handleCleanup(req);
}

export async function POST(req: NextRequest) {
  return handleCleanup(req);
}
