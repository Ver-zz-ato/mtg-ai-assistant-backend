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
    scheduled_for: z.string().nullable().optional(),
    campaign: z.string().max(200).nullable().optional(),
    copied_at: z.string().nullable().optional(),
    external_post_url: z.string().url().nullable().optional().or(z.literal("")),
    mark_copied: z.boolean().optional(),
    mark_posted: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.content !== undefined ||
      v.status !== undefined ||
      v.notes !== undefined ||
      v.scheduled_for !== undefined ||
      v.campaign !== undefined ||
      v.copied_at !== undefined ||
      v.external_post_url !== undefined ||
      v.mark_copied === true ||
      v.mark_posted === true,
    { message: "At least one field is required" }
  );

type RouteContext = { params: Promise<{ id: string }> };

const DRAFT_SELECT =
  "id, brief_id, platform, content, status, notes, quality_flags, scheduled_for, campaign, copied_at, external_post_url, external_post_id, posted_at, superseded_at, created_at, updated_at";

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
    const d = parsed.data;
    if (d.content !== undefined) patch.content = d.content;
    if (d.status !== undefined) patch.status = d.status;
    if (d.notes !== undefined) patch.notes = d.notes;
    if (d.scheduled_for !== undefined) patch.scheduled_for = d.scheduled_for;
    if (d.campaign !== undefined) patch.campaign = d.campaign;
    if (d.copied_at !== undefined) patch.copied_at = d.copied_at;
    if (d.external_post_url !== undefined) {
      patch.external_post_url = d.external_post_url || null;
    }
    if (d.mark_copied) patch.copied_at = new Date().toISOString();
    if (d.mark_posted && d.external_post_url) {
      patch.external_post_url = d.external_post_url;
    }

    const { data, error } = await admin
      .from("marketing_drafts")
      .update(patch)
      .eq("id", id)
      .select(DRAFT_SELECT)
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
