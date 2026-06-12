import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchMarketingContext,
  metaSnapshotHasData,
} from "./fetchMarketingContext";
import { generateMarketingBrief } from "./generateMarketingBrief";
import { commanderNamesFromBriefContext } from "./marketingCommanderLinks";
import type { MarketingBriefRow, MarketingDraftRow } from "./marketingBriefSchema";
import { normalizeBriefDrafts } from "./normalizeBriefDrafts";
import { processBriefDraftsForInsert } from "./processBriefDrafts";

export type CreateBriefResult = {
  brief: MarketingBriefRow;
  drafts: MarketingDraftRow[];
};

const BRIEF_SELECT =
  "id, brief_date, summary, primary_cta, content_format, seo_target_keyword, social_repurpose, trending_cards, trending_topics, opportunities, created_at";

const DRAFT_SELECT =
  "id, brief_id, platform, content, status, notes, quality_flags, scheduled_for, campaign, copied_at, external_post_url, superseded_at, created_at, updated_at";

function briefInsertFields(briefOutput: ReturnType<typeof normalizeBriefDrafts>, briefDate: string) {
  return {
    brief_date: briefDate,
    summary: briefOutput.summary,
    primary_cta: briefOutput.primary_cta,
    content_format: briefOutput.content_format,
    seo_target_keyword: briefOutput.seo_target_keyword ?? null,
    social_repurpose: briefOutput.social_repurpose ?? null,
    trending_cards: briefOutput.trending_cards,
    trending_topics: briefOutput.trending_topics,
    opportunities: briefOutput.opportunities,
  };
}

function expectCommanderLink(
  briefOutput: ReturnType<typeof normalizeBriefDrafts>,
  metaCommanders: string[]
): boolean {
  if (briefOutput.content_format === "commander_spotlight") return true;
  return commanderNamesFromBriefContext({ metaCommanders }).length > 0;
}

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

  const briefDate = new Date().toISOString().slice(0, 10);
  const briefOutput = normalizeBriefDrafts(
    await generateMarketingBrief({
      signals,
      metaContext: meta_snapshot,
      userId: opts?.userId ?? null,
    })
  );

  const { data: briefRow, error: briefErr } = await admin
    .from("marketing_briefs")
    .insert(briefInsertFields(briefOutput, briefDate))
    .select(BRIEF_SELECT)
    .single();

  if (briefErr || !briefRow) {
    throw new Error(briefErr?.message ?? "brief_insert_failed");
  }

  const draftInserts = processBriefDraftsForInsert(briefOutput, briefDate, {
    expectCommanderLink: expectCommanderLink(briefOutput, meta_snapshot.trending_commanders),
  }).map((d) => ({
    brief_id: briefRow.id,
    ...d,
  }));

  const { data: draftRows, error: draftErr } = await admin
    .from("marketing_drafts")
    .insert(draftInserts)
    .select(DRAFT_SELECT);

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

  const briefOutput = normalizeBriefDrafts(
    await generateMarketingBrief({
      signals,
      metaContext: meta_snapshot,
      userId: opts?.userId ?? null,
    })
  );

  const briefDate = brief.brief_date ?? new Date().toISOString().slice(0, 10);

  await admin
    .from("marketing_briefs")
    .update({
      summary: briefOutput.summary,
      primary_cta: briefOutput.primary_cta,
      content_format: briefOutput.content_format,
      seo_target_keyword: briefOutput.seo_target_keyword ?? null,
      social_repurpose: briefOutput.social_repurpose ?? null,
      trending_cards: briefOutput.trending_cards,
      trending_topics: briefOutput.trending_topics,
      opportunities: briefOutput.opportunities,
    })
    .eq("id", briefId);

  await admin
    .from("marketing_drafts")
    .update({ superseded_at: new Date().toISOString(), status: "superseded", updated_at: new Date().toISOString() })
    .eq("brief_id", briefId)
    .in("status", ["draft", "rejected", "approved"])
    .is("superseded_at", null);

  const draftInserts = processBriefDraftsForInsert(briefOutput, briefDate, {
    expectCommanderLink: expectCommanderLink(briefOutput, meta_snapshot.trending_commanders),
  }).map((d) => ({
    brief_id: briefId,
    ...d,
  }));

  const { data: draftRows, error: draftErr } = await admin
    .from("marketing_drafts")
    .insert(draftInserts)
    .select(DRAFT_SELECT);

  if (draftErr) throw new Error(draftErr.message);

  return { drafts: (draftRows ?? []) as MarketingDraftRow[] };
}
