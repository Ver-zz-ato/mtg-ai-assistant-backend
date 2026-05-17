import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { verifyCronRequest } from "@/lib/server/verifyCronRequest";

export const runtime = "nodejs";
export const maxDuration = 60; // 1 minute

/**
 * Cleanup expired guest sessions.
 * Runs daily via Vercel cron to remove old guest_session records.
 */
async function handleCleanup(req: NextRequest) {
  console.log("[cleanup-guest-sessions] started");

  try {
    if (!verifyCronRequest(req, { routePath: "/api/cron/cleanup-guest-sessions" })) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const admin = getAdmin();
    if (!admin) {
      throw new Error("Admin client not available");
    }

    const { count, error } = await admin
      .from("guest_sessions")
      .delete()
      .lt("expires_at", new Date().toISOString());

    if (error) {
      throw new Error(`Cleanup failed: ${error.message}`);
    }

    console.log("[cleanup-guest-sessions] completed", { cleaned: count || 0 });

    return NextResponse.json({
      ok: true,
      cleaned: count || 0,
      message: "Guest sessions cleanup completed",
    });
  } catch (error: any) {
    console.error("[cleanup-guest-sessions] failed", error);
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
