import { NextRequest, NextResponse } from "next/server";
import {
  getMobileCommandCenterSecurity,
  parseDaysParam,
  parseHoursParam,
} from "@/lib/admin/mobile-command-center";
import { requireAdminForApi } from "@/lib/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdminForApi();
  if (!admin.ok) return admin.response;
  const days = parseDaysParam(req.nextUrl.searchParams.get("days"), 7);
  const hours = parseHoursParam(req.nextUrl.searchParams.get("hours"), 24);
  const payload = await getMobileCommandCenterSecurity(days, hours);
  return NextResponse.json({ ok: true, ...payload }, { headers: { "Cache-Control": "no-store" } });
}
