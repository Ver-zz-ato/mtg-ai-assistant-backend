import { NextRequest, NextResponse } from "next/server";
import { runOpsReport } from "@/lib/ops/run-ops-report";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret =
    process.env.CRON_SECRET ||
    process.env.CRON_KEY ||
    process.env.RENDER_CRON_SECRET ||
    "";
  const hdr = req.headers.get("x-cron-key") || req.headers.get("authorization")?.replace("Bearer ", "") || "";
  if (!secret || hdr !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await runOpsReport("daily_ops");
  return NextResponse.json(result);
}
