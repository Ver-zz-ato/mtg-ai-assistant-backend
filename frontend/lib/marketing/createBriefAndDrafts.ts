import type { SupabaseClient } from "@supabase/supabase-js";
import { checkDraftQuality } from "./checkDraftQuality";
import {
  fetchMarketingContext,
  metaSnapshotHasData,
} from "./fetchMarketingContext";
import { generateMarketingBrief } from "./generateMarketingBrief";
import type { MarketingBriefRow, MarketingDraftRow } from "./marketingBriefSchema";

export type CreateBriefResult = {
  brief: MarketingBriefRow;
  drafts: MarketingDraftRow[];
};

export async function createBriefAndDrafts(
  admin: SupabaseClient,
  opts?: { userId?: string | null }
): Promise<CreateBriefResult | { error: "no_signals"; message: string }> {
  const { signals, meta_snapshot } = await fetchMarketingContext(admin);

  if (signals.length === 0 && !metaSnapshotHasData(meta_snapshot)) {
    return {
      error: "no_signals",
      message:
        "Add signals or wait for meta_signals data before running a brief.",
    };
  }

  const briefOutput = await generateMarketingBrief({
    signals,
    metaContext: meta_snapshot,
    userId: opts?.userId ?? null,
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
    throw new Error(briefErr?.message ?? "brief_insert_failed");
  }

  const draftInserts = briefOutput.drafts.map((d) => ({
    brief_id: briefRow.id,
    platform: d.platform,
    content: d.content,
    status: "draft" as const,
    quality_flags: checkDraftQuality(d.content, d.platform),
  }));

  const { data: draftRows, error: draftErr } = await admin
    .from("marketing_drafts")
    .insert(draftInserts)
    .select(
      "id, brief_id, platform, content, status, notes, quality_flags, scheduled_for, campaign, copied_at, external_post_url, superseded_at, created_at, updated_at"
    );

  if (draftErr) throw new Error(draftErr.message);

  return {
    brief: briefRow as MarketingBriefRow,
    drafts: (draftRows ?? []) as MarketingDraftRow[],
  };
}

export async function regenerateBriefDrafts(
  admin: SupabaseClient,
  briefId: string,
  opts?: { userId?: string | null }
): Promise<{ drafts: MarketingDraftRow[] }> {
  const { data: brief, error: briefErr } = await admin
    .from("marketing_briefs")
    .select("id, brief_date, created_at")
    .eq("id", briefId)
    .maybeSingle();

  if (briefErr) throw new Error(briefErr.message);
  if (!brief) throw new Error("brief_not_found");

  const { signals, meta_snapshot } = await fetchMarketingContext(admin, {
    days: 7,
    limit: 30,
  });

  const briefOutput = await generateMarketingBrief({
    signals,
    metaContext: meta_snapshot,
    userId: opts?.userId ?? null,
  });

  await admin
    .from("marketing_drafts")
    .update({ superseded_at: new Date().toISOString(), status: "superseded", updated_at: new Date().toISOString() })
    .eq("brief_id", briefId)
    .in("status", ["draft", "rejected"])
    .is("superseded_at", null);

  const draftInserts = briefOutput.drafts.map((d) => ({
    brief_id: briefId,
    platform: d.platform,
    content: d.content,
    status: "draft" as const,
    quality_flags: checkDraftQuality(d.content, d.platform),
  }));

  const { data: draftRows, error: draftErr } = await admin
    .from("marketing_drafts")
    .insert(draftInserts)
    .select(
      "id, brief_id, platform, content, status, notes, quality_flags, scheduled_for, campaign, copied_at, external_post_url, superseded_at, created_at, updated_at"
    );

  if (draftErr) throw new Error(draftErr.message);

  return { drafts: (draftRows ?? []) as MarketingDraftRow[] };
}
