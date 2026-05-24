import { NextRequest, NextResponse } from "next/server";
import { sendMobileCommandCenterTestDiscord } from "@/lib/admin/mobile-command-center";
import { validateOrigin } from "@/lib/api/csrf";
import { requireAdminForApi } from "@/lib/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await requireAdminForApi();
  if (!admin.ok) return admin.response;
  if (!validateOrigin(req)) {
    return NextResponse.json(
      { ok: false, error: "Invalid origin. This request must come from the same site." },
      { status: 403 },
    );
  }

  const payload = await sendMobileCommandCenterTestDiscord(admin.user.id);
  return NextResponse.json({ ok: true, ...payload }, { headers: { "Cache-Control": "no-store" } });
}
