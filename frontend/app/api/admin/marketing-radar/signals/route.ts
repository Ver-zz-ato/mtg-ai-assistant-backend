import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin } from "@/app/api/_lib/supa";
import { validateOrigin } from "@/lib/api/csrf";
import { requireAdminForApi } from "@/lib/server-admin";
import { ingestManualSignal } from "@/lib/marketing/ingestManualSignal";

export const runtime = "nodejs";

const bodySchema = z.object({
  title: z.string().max(200).optional().nullable(),
  url: z.union([z.string().url(), z.literal("")]).optional().nullable(),
  raw_text: z.string().min(1).max(50000),
  source_name: z.string().max(120).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    if (!validateOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: "Invalid origin. This request must come from the same site." },
        { status: 403 }
      );
    }

    const auth = await requireAdminForApi();
    if (!auth.ok) return auth.response;

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const signal = await ingestManualSignal(admin, {
      title: parsed.data.title,
      url: parsed.data.url || null,
      raw_text: parsed.data.raw_text,
      source_name: parsed.data.source_name,
    });

    return NextResponse.json({ ok: true, signal });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
