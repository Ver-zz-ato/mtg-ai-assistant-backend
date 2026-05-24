import { NextRequest, NextResponse } from "next/server";
import { getMobileCommandCenterOps, parseDaysParam } from "@/lib/admin/mobile-command-center";
import { requireAdminForApi } from "@/lib/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdminForApi();
  if (!admin.ok) return admin.response;
  const days = parseDaysParam(req.nextUrl.searchParams.get("days"), 7);
  const payload = await getMobileCommandCenterOps(days);
  return NextResponse.json({ ok: true, ...payload }, { headers: { "Cache-Control": "no-store" } });
}
