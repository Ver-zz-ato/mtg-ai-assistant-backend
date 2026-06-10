import { NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { requireAdminForApi } from "@/lib/server-admin";
import {
  fetchMetaSignalsSnapshot,
  fetchRecentMarketingSignals,
} from "@/lib/marketing/fetchMarketingContext";
import type { MarketingDraftRow } from "@/lib/marketing/marketingBriefSchema";

export const runtime = "nodejs";

function groupDraftsByPlatform(drafts: MarketingDraftRow[]): Record<string, MarketingDraftRow[]> {
  const grouped: Record<string, MarketingDraftRow[]> = {};
  for (const d of drafts) {
    if (!grouped[d.platform]) grouped[d.platform] = [];
    grouped[d.platform].push(d);
  }
  return grouped;
}

export async function GET() {
  try {
    const auth = await requireAdminForApi();
    if (!auth.ok) return auth.response;

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const [latestBriefRes, recentSignals, sourcesRes, meta_snapshot] = await Promise.all([
      admin
        .from("marketing_briefs")
        .select("id, brief_date, summary, trending_cards, trending_topics, opportunities, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      fetchRecentMarketingSignals(admin, { days: 7, limit: 20 }),
      admin
        .from("marketing_sources")
        .select("id, type, name, url, enabled, created_at")
        .eq("enabled", true)
        .order("name"),
      fetchMetaSignalsSnapshot(admin),
    ]);

    if (latestBriefRes.error) {
      return NextResponse.json({ ok: false, error: latestBriefRes.error.message }, { status: 500 });
    }
    if (sourcesRes.error) {
      return NextResponse.json({ ok: false, error: sourcesRes.error.message }, { status: 500 });
    }

    const latest_brief = latestBriefRes.data ?? null;
    let drafts: MarketingDraftRow[] = [];
    let drafts_by_platform: Record<string, MarketingDraftRow[]> = {};

    if (latest_brief?.id) {
      const { data: draftRows, error: draftErr } = await admin
        .from("marketing_drafts")
        .select("id, brief_id, platform, content, status, notes, created_at, updated_at")
        .eq("brief_id", latest_brief.id)
        .order("platform")
        .order("created_at");

      if (draftErr) {
        return NextResponse.json({ ok: false, error: draftErr.message }, { status: 500 });
      }
      drafts = (draftRows ?? []) as MarketingDraftRow[];
      drafts_by_platform = groupDraftsByPlatform(drafts);
    }

    return NextResponse.json(
      {
        ok: true,
        latest_brief,
        drafts,
        drafts_by_platform,
        recent_signals: recentSignals,
        sources: sourcesRes.data ?? [],
        meta_snapshot,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
