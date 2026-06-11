import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { requireAdminForApi } from "@/lib/server-admin";
import {
  fetchBriefHistory,
  fetchMarketingContext,
  fetchMetaSignalsSnapshot,
  type SignalFilters,
} from "@/lib/marketing/fetchMarketingContext";
import { isYouTubeApiKeyConfigured } from "@/lib/marketing/fetchYouTubeSignals";
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

const DRAFT_SELECT =
  "id, brief_id, platform, content, status, notes, quality_flags, scheduled_for, campaign, copied_at, external_post_url, superseded_at, created_at, updated_at";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminForApi();
    if (!auth.ok) return auth.response;

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const sp = req.nextUrl.searchParams;
    const briefId = sp.get("brief_id");

    const filters: SignalFilters = {
      source_type: sp.get("source_type"),
      topic: sp.get("topic"),
      card: sp.get("card"),
      min_score: sp.get("min_score") ? Number(sp.get("min_score")) : null,
      from: sp.get("from"),
      to: sp.get("to"),
    };

    const draftPlatform = sp.get("draft_platform");
    const draftStatus = sp.get("draft_status");

    const [briefHistory, recentSignals, sourcesRes, meta_snapshot] = await Promise.all([
      fetchBriefHistory(admin, 20),
      fetchMarketingContext(admin, { days: 7, limit: 50, filters, listLimit: 100 }).then(
        (c) => c.signals
      ),
      admin
        .from("marketing_sources")
        .select("id, type, name, url, enabled, last_fetched_at, fetch_error, metadata, created_at")
        .order("type")
        .order("name"),
      fetchMetaSignalsSnapshot(admin),
    ]);

    let latest_brief = null;
    let drafts: MarketingDraftRow[] = [];
    let drafts_by_platform: Record<string, MarketingDraftRow[]> = {};

    let latestBriefRes;
    if (briefId) {
      latestBriefRes = await admin
        .from("marketing_briefs")
        .select("id, brief_date, summary, trending_cards, trending_topics, opportunities, created_at")
        .eq("id", briefId)
        .maybeSingle();
    } else {
      latestBriefRes = await admin
        .from("marketing_briefs")
        .select("id, brief_date, summary, trending_cards, trending_topics, opportunities, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    }
    if (latestBriefRes.error) {
      return NextResponse.json({ ok: false, error: latestBriefRes.error.message }, { status: 500 });
    }
    if (sourcesRes.error) {
      return NextResponse.json({ ok: false, error: sourcesRes.error.message }, { status: 500 });
    }

    latest_brief = latestBriefRes.data ?? null;

    if (latest_brief?.id) {
      let draftQuery = admin
        .from("marketing_drafts")
        .select(DRAFT_SELECT)
        .eq("brief_id", latest_brief.id)
        .is("superseded_at", null)
        .order("platform")
        .order("created_at");

      if (draftPlatform) draftQuery = draftQuery.eq("platform", draftPlatform);
      if (draftStatus) draftQuery = draftQuery.eq("status", draftStatus);

      const { data: draftRows, error: draftErr } = await draftQuery;
      if (draftErr) {
        return NextResponse.json({ ok: false, error: draftErr.message }, { status: 500 });
      }
      drafts = (draftRows ?? []) as MarketingDraftRow[];
      drafts_by_platform = groupDraftsByPlatform(drafts);
    }

    const { data: calendarDrafts } = await admin
      .from("marketing_drafts")
      .select(DRAFT_SELECT)
      .not("scheduled_for", "is", null)
      .is("superseded_at", null)
      .order("scheduled_for", { ascending: true })
      .limit(100);

    return NextResponse.json(
      {
        ok: true,
        latest_brief,
        drafts,
        drafts_by_platform,
        recent_signals: recentSignals,
        brief_history: briefHistory,
        sources: sourcesRes.data ?? [],
        meta_snapshot,
        calendar_drafts: calendarDrafts ?? [],
        config: {
          youtube_api_key_configured: isYouTubeApiKeyConfigured(),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
