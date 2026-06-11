import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyMarketingReview } from "./notifyMarketingReview";
import { runDailyMarketingRadar, type DailyRadarSummary } from "./runDailyMarketingRadar";

export type ReviewCycleSummary = DailyRadarSummary & {
  notification: { sent: boolean; reason?: string };
};

export async function runMarketingRadarReviewCycle(
  admin: SupabaseClient,
  opts?: { userId?: string | null; notify?: boolean }
): Promise<ReviewCycleSummary> {
  const summary = await runDailyMarketingRadar(admin, opts);

  let notification: { sent: boolean; reason?: string } = { sent: false, reason: "skipped" };

  if (opts?.notify !== false && summary.brief?.created && summary.brief.briefId) {
    const { data: brief } = await admin
      .from("marketing_briefs")
      .select("summary")
      .eq("id", summary.brief.briefId)
      .maybeSingle();

    const { data: drafts } = await admin
      .from("marketing_drafts")
      .select("platform")
      .eq("brief_id", summary.brief.briefId)
      .is("superseded_at", null);

    notification = await notifyMarketingReview({
      briefId: summary.brief.briefId,
      summary: (brief?.summary as string) || "New marketing brief ready",
      draftPlatforms: (drafts ?? []).map((d) => String(d.platform)),
    });
  }

  return { ...summary, notification };
}
