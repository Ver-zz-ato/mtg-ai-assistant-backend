import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketingDraftRow } from "../marketingBriefSchema";
import { publishToBlog } from "./publishToBlog";
import { publishToInstagram } from "./publishToInstagram";
import { publishToX } from "./publishToX";

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

  let result: { externalPostId: string; externalPostUrl: string };

  switch (draft.platform) {
    case "x":
      result = await publishToX(draft.content);
      break;
    case "instagram":
      result = await publishToInstagram(draft.content);
      break;
    case "blog":
      result = await publishToBlog(admin, draft.content);
      break;
    default:
      throw new Error(`Publishing not supported for platform: ${draft.platform}`);
  }

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
