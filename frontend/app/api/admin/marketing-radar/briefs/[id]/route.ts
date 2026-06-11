import { NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { requireAdminForApi } from "@/lib/server-admin";

export const runtime = "nodejs";

const DRAFT_SELECT =
  "id, brief_id, platform, content, status, notes, quality_flags, scheduled_for, campaign, copied_at, external_post_url, superseded_at, created_at, updated_at";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  try {
    const auth = await requireAdminForApi();
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const { data: brief, error: briefErr } = await admin
      .from("marketing_briefs")
      .select("id, brief_date, summary, trending_cards, trending_topics, opportunities, created_at")
      .eq("id", id)
      .maybeSingle();

    if (briefErr) return NextResponse.json({ ok: false, error: briefErr.message }, { status: 500 });
    if (!brief) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const { data: drafts, error: draftErr } = await admin
      .from("marketing_drafts")
      .select(DRAFT_SELECT)
      .eq("brief_id", id)
      .is("superseded_at", null)
      .order("platform")
      .order("created_at");

    if (draftErr) return NextResponse.json({ ok: false, error: draftErr.message }, { status: 500 });

    return NextResponse.json(
      { ok: true, brief, drafts: drafts ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
