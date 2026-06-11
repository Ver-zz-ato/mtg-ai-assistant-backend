import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { validateOrigin } from "@/lib/api/csrf";
import { requireAdminForApi } from "@/lib/server-admin";
import { regenerateBriefDrafts } from "@/lib/marketing/createBriefAndDrafts";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    if (!validateOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: "Invalid origin. This request must come from the same site." },
        { status: 403 }
      );
    }

    const auth = await requireAdminForApi();
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const result = await regenerateBriefDrafts(admin, id, { userId: auth.user.id });
    return NextResponse.json({ ok: true, drafts: result.drafts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
