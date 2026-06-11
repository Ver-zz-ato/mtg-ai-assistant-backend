import type { MarketingBriefAiOutput } from "./marketingBriefSchema";
import { MARKETING_PLATFORMS } from "./marketingBriefSchema";

/** Keep exactly one draft per platform (first wins). */
export function normalizeBriefDrafts(output: MarketingBriefAiOutput): MarketingBriefAiOutput {
  const byPlatform = new Map<string, (typeof output.drafts)[0]>();
  for (const d of output.drafts) {
    if (!byPlatform.has(d.platform)) byPlatform.set(d.platform, d);
  }
  const drafts = MARKETING_PLATFORMS.map((p) => byPlatform.get(p)).filter(
    (d): d is (typeof output.drafts)[0] => !!d
  );
  return { ...output, drafts };
}
