import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { verifyCronRequest } from "@/lib/server/verifyCronRequest";

export const runtime = "nodejs";
export const maxDuration = 60; // 1 minute

export async function POST(req: NextRequest) {
  console.log("[cleanup-price-cache] started");

  try {
    if (!verifyCronRequest(req, { routePath: "/api/cron/cleanup-price-cache" })) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const admin = getAdmin();
    if (!admin) {
      throw new Error("Admin client not available");
    }

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { count, error } = await admin.from("price_cache").delete().lt("updated_at", cutoff);

    if (error) {
      throw new Error(`Cleanup failed: ${error.message}`);
    }

    console.log("[cleanup-price-cache] completed", { cleaned: count || 0 });

    return NextResponse.json({
      ok: true,
      cleaned: count || 0,
      cutoff_time: cutoff,
      message: "Price cache cleanup completed",
    });
  } catch (error: any) {
    console.error("[cleanup-price-cache] failed", error);
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
  return POST(req);
}
