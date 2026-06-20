import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin } from "@/app/api/_lib/supa";
import { validateOrigin } from "@/lib/api/csrf";
import { runExternalDeckMetaIngest } from "@/lib/external-deck-meta/service";
import { requireAdminForApi } from "@/lib/server-admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  source: z.enum(["all", "archidekt", "moxfield"]).optional().default("all"),
  limit: z.number().int().min(1).max(60).optional(),
  discover: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    if (!validateOrigin(req)) {
      return NextResponse.json({ ok: false, error: "Invalid origin." }, { status: 403 });
    }
    const auth = await requireAdminForApi();
    if (!auth.ok) return auth.response;
    const admin = getAdmin();
    if (!admin) return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const summary = await runExternalDeckMetaIngest(admin, parsed.data);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "server_error" }, { status: 500 });
  }
}
