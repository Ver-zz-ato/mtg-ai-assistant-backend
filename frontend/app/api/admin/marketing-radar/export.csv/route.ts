import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { requireAdminForApi } from "@/lib/server-admin";

export const runtime = "nodejs";

const DRAFT_SELECT =
  "id, brief_id, platform, content, status, campaign, scheduled_for, external_post_url, quality_flags, created_at, updated_at";

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminForApi();
    if (!auth.ok) return auth.response;

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const briefId = req.nextUrl.searchParams.get("brief_id");

    let query = admin
      .from("marketing_drafts")
      .select(DRAFT_SELECT)
      .is("superseded_at", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (briefId) query = query.eq("brief_id", briefId);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const header = [
      "platform",
      "content",
      "status",
      "campaign",
      "scheduled_for",
      "external_post_url",
      "created_at",
      "quality_flags",
    ];
    const lines = [header.join(",")];
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      lines.push(
        [
          csvEscape(r.platform),
          csvEscape(r.content),
          csvEscape(r.status),
          csvEscape(r.campaign),
          csvEscape(r.scheduled_for),
          csvEscape(r.external_post_url),
          csvEscape(r.created_at),
          csvEscape(JSON.stringify(r.quality_flags ?? [])),
        ].join(",")
      );
    }

    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="marketing-drafts.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
