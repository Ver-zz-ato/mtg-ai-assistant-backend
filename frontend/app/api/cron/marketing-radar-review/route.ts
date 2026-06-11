import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { runMarketingRadarReviewCycle } from "@/lib/marketing/runMarketingRadarReviewCycle";
import { verifyCronRequest } from "@/lib/server/verifyCronRequest";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }

  try {
    const summary = await runMarketingRadarReviewCycle(admin, { notify: true });
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "review_cycle_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
