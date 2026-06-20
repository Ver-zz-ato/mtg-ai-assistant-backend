import { NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { getExternalDeckMetaStatus } from "@/lib/external-deck-meta/service";
import { requireAdminForApi } from "@/lib/server-admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireAdminForApi();
    if (!auth.ok) return auth.response;
    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    const data = await getExternalDeckMetaStatus(admin);
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "server_error" }, { status: 500 });
  }
}
