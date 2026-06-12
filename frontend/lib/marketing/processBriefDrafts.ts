import type { MarketingBriefAiOutput, MarketingPlatform } from "./marketingBriefSchema";
import { checkDraftQuality, type DraftQualityFlag } from "./checkDraftQuality";
import {
  applyUtmToDraftContent,
  buildCampaignSlug,
  contentIncludesCtaPath,
  primaryCtaPath,
  type MarketingUtmPlatform,
} from "./marketingUtm";
import { validateBlogSeo } from "./validateBlogSeo";

export type ProcessedDraftInsert = {
  platform: MarketingPlatform;
  content: string;
  status: "draft";
  quality_flags: string[];
  campaign: string;
};

export function processBriefDraftsForInsert(
  briefOutput: MarketingBriefAiOutput,
  briefDate: string,
  opts?: { expectCommanderLink?: boolean }
): ProcessedDraftInsert[] {
  const campaign = buildCampaignSlug(briefDate);
  const ctaPath = primaryCtaPath(briefOutput.primary_cta.landing_url);

  return briefOutput.drafts.map((d) => {
    const platform = d.platform as MarketingUtmPlatform;
    let content = applyUtmToDraftContent(d.content, platform, campaign);

    const flags = new Set<DraftQualityFlag>(
      checkDraftQuality(content, d.platform)
    );

    if (!contentIncludesCtaPath(content, ctaPath)) {
      flags.add("cta_mismatch");
    }

    if (d.platform === "blog") {
      for (const f of validateBlogSeo(content, {
        expectCommanderLink: opts?.expectCommanderLink,
      })) {
        flags.add(f as DraftQualityFlag);
      }
    }

    return {
      platform: d.platform,
      content,
      status: "draft" as const,
      quality_flags: [...flags],
      campaign,
    };
  });
}
