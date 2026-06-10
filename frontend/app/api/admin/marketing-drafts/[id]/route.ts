import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdmin } from "@/app/api/_lib/supa";
import { validateOrigin } from "@/lib/api/csrf";
import { requireAdminForApi } from "@/lib/server-admin";
import { MARKETING_DRAFT_STATUSES } from "@/lib/marketing/marketingBriefSchema";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    content: z.string().min(1).max(50000).optional(),
    status: z.enum(MARKETING_DRAFT_STATUSES).optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .refine((v) => v.content !== undefined || v.status !== undefined || v.notes !== undefined, {
    message: "At least one of content, status, or notes is required",
  });

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
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
    if (!id) {
      return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const json = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.content !== undefined) patch.content = parsed.data.content;
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;

    const { data, error } = await admin
      .from("marketing_drafts")
      .update(patch)
      .eq("id", id)
      .select("id, brief_id, platform, content, status, notes, created_at, updated_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, draft: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
