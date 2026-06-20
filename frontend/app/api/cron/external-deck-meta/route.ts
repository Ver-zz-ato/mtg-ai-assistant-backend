import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { runExternalDeckMetaIngest } from "@/lib/external-deck-meta/service";
import { verifyCronRequest } from "@/lib/server/verifyCronRequest";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req, { routePath: "/api/cron/external-deck-meta" })) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    const summary = await runExternalDeckMetaIngest(admin, { source: "all", discover: true });
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "server_error" }, { status: 500 });
  }
}
