import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { validateOrigin } from "@/lib/api/csrf";
import { requireAdminForApi } from "@/lib/server-admin";
import {
  fetchMarketingContext,
  metaSnapshotHasData,
} from "@/lib/marketing/fetchMarketingContext";
import { generateMarketingBrief } from "@/lib/marketing/generateMarketingBrief";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const { signals, meta_snapshot } = await fetchMarketingContext(admin);

    if (signals.length === 0 && !metaSnapshotHasData(meta_snapshot)) {
      return NextResponse.json(
        {
          ok: false,
          error: "no_signals",
          message:
            "Add at least one manual marketing signal or wait for meta_signals cron data before running a brief.",
        },
        { status: 400 }
      );
    }

    const briefOutput = await generateMarketingBrief({
      signals,
      metaContext: meta_snapshot,
      userId: auth.user.id,
    });

    const { data: briefRow, error: briefErr } = await admin
      .from("marketing_briefs")
      .insert({
        brief_date: new Date().toISOString().slice(0, 10),
        summary: briefOutput.summary,
        trending_cards: briefOutput.trending_cards,
        trending_topics: briefOutput.trending_topics,
        opportunities: briefOutput.opportunities,
      })
      .select("id, brief_date, summary, trending_cards, trending_topics, opportunities, created_at")
      .single();

    if (briefErr || !briefRow) {
      return NextResponse.json(
        { ok: false, error: briefErr?.message ?? "brief_insert_failed" },
        { status: 500 }
      );
    }

    const draftInserts = briefOutput.drafts.map((d) => ({
      brief_id: briefRow.id,
      platform: d.platform,
      content: d.content,
      status: "draft" as const,
    }));

    const { data: draftRows, error: draftErr } = await admin
      .from("marketing_drafts")
      .insert(draftInserts)
      .select("id, brief_id, platform, content, status, notes, created_at, updated_at");

    if (draftErr) {
      return NextResponse.json({ ok: false, error: draftErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      brief: briefRow,
      drafts: draftRows ?? [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
