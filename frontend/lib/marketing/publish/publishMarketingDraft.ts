import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketingDraftRow } from "../marketingBriefSchema";
import { publishToBlog } from "./publishToBlog";

export async function publishMarketingDraft(
  admin: SupabaseClient,
  draft: MarketingDraftRow
): Promise<{ externalPostId: string; externalPostUrl: string }> {
  if (draft.status !== "approved") {
    throw new Error("Only approved drafts can be published");
  }
  if (draft.superseded_at) {
    throw new Error("Draft is superseded");
  }
  if (draft.platform !== "blog") {
    throw new Error(
      `${draft.platform} is manual-only — copy from admin and post in the app yourself`
    );
  }

  const result = await publishToBlog(admin, draft.content);

  const now = new Date().toISOString();
  const { error } = await admin
    .from("marketing_drafts")
    .update({
      status: "posted",
      posted_at: now,
      external_post_id: result.externalPostId,
      external_post_url: result.externalPostUrl,
      updated_at: now,
    })
    .eq("id", draft.id);

  if (error) throw new Error(error.message);
  return result;
}
