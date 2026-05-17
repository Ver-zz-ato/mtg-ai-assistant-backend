import { NextRequest, NextResponse } from "next/server";
import { runOpsReport } from "@/lib/ops/run-ops-report";
import { verifyCronRequest } from "@/lib/server/verifyCronRequest";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req, { routePath: "/api/cron/ops-report" })) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const typeParam = req.nextUrl.searchParams.get("type") || "weekly";
  const reportType = typeParam === "daily" ? "daily_ops" : "weekly_ops";

  const result = await runOpsReport(reportType);
  return NextResponse.json(result);
}
