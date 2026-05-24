import { NextRequest, NextResponse } from "next/server";
import { refreshMobileCommandCenterRollups } from "@/lib/admin/mobile-command-center";
import { verifyCronRequest } from "@/lib/server/verifyCronRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req, { routePath: "/api/cron/mobile-command-center-rollups" })) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const days = Math.max(1, Math.min(30, Number.parseInt(req.nextUrl.searchParams.get("days") || "7", 10) || 7));
  const payload = await refreshMobileCommandCenterRollups({
    days,
    actorId: "cron",
    sendDiscord: true,
  });
  return NextResponse.json({ ok: true, ...payload }, { headers: { "Cache-Control": "no-store" } });
}
