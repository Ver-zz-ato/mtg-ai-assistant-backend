import { NextRequest, NextResponse } from "next/server";
import { parseDaysParam, refreshMobileCommandCenterRollups } from "@/lib/admin/mobile-command-center";
import { validateOrigin } from "@/lib/api/csrf";
import { requireAdminForApi } from "@/lib/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasCronSecret(req: NextRequest): boolean {
  const expected = process.env.ADMIN_CRON_SECRET || process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization") || req.headers.get("x-cron-secret") || "";
  return header === expected || header === `Bearer ${expected}`;
}

export async function POST(req: NextRequest) {
  let actorId: string | null = null;
  const cronAuthed = hasCronSecret(req);
  if (!cronAuthed) {
    const admin = await requireAdminForApi();
    if (!admin.ok) return admin.response;
    if (!validateOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: "Invalid origin. This request must come from the same site." },
        { status: 403 },
      );
    }
    actorId = admin.user.id;
  }

  const body = (await req.json().catch(() => ({}))) as { days?: unknown; sendDiscord?: unknown };
  const days = parseDaysParam(String(body.days || req.nextUrl.searchParams.get("days") || "7"), 7);
  const sendDiscord = body.sendDiscord === true || req.nextUrl.searchParams.get("sendDiscord") === "true";
  const payload = await refreshMobileCommandCenterRollups({ days, actorId, sendDiscord });
  return NextResponse.json({ ok: true, ...payload }, { headers: { "Cache-Control": "no-store" } });
}
