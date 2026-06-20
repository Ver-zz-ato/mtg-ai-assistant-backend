import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin } from "@/app/api/_lib/supa";
import { validateOrigin } from "@/lib/api/csrf";
import { setExternalCommanderProfileApproval } from "@/lib/external-deck-meta/service";
import { requireAdminForApi } from "@/lib/server-admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  approved: z.boolean(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!validateOrigin(req)) {
      return NextResponse.json({ ok: false, error: "Invalid origin." }, { status: 403 });
    }
    const auth = await requireAdminForApi();
    if (!auth.ok) return auth.response;
    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    const { id } = await params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const profile = await setExternalCommanderProfileApproval(admin, id, parsed.data.approved, auth.user.id);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "server_error" }, { status: 500 });
  }
}
