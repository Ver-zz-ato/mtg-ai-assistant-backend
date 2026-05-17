import { NextRequest, NextResponse } from "next/server";
import { runOpsReport } from "@/lib/ops/run-ops-report";
import { verifyCronRequest } from "@/lib/server/verifyCronRequest";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req, { routePath: "/api/cron/ops-report/weekly" })) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await runOpsReport("weekly_ops");
  return NextResponse.json(result);
}
