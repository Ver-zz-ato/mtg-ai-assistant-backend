import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { validateOrigin } from "@/lib/api/csrf";
import { publishMarketingDraft } from "@/lib/marketing/publish/publishMarketingDraft";
import { requireAdminForApi } from "@/lib/server-admin";

export const runtime = "nodejs";

const DRAFT_SELECT =
  "id, brief_id, platform, content, status, notes, quality_flags, scheduled_for, campaign, copied_at, external_post_url, external_post_id, posted_at, superseded_at, created_at, updated_at";

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

    const { data: draft, error: fetchErr } = await admin
      .from("marketing_drafts")
      .select(DRAFT_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
    }
    if (!draft) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    let blogOpts: Record<string, string | undefined> | undefined;
    try {
      const body = await req.json();
      if (body && typeof body === "object") {
        blogOpts = {
          slug: typeof body.slug === "string" ? body.slug : undefined,
          category: typeof body.category === "string" ? body.category : undefined,
          gradient: typeof body.gradient === "string" ? body.gradient : undefined,
          icon: typeof body.icon === "string" ? body.icon : undefined,
          title: typeof body.title === "string" ? body.title : undefined,
        };
      }
    } catch {
      // Empty body is fine — use defaults
    }

    const result = await publishMarketingDraft(admin, draft, blogOpts);

    const { data: updated } = await admin
      .from("marketing_drafts")
      .select(DRAFT_SELECT)
      .eq("id", id)
      .maybeSingle();

    return NextResponse.json({ ok: true, ...result, draft: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "publish_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
