import { z } from "zod";

export const MARKETING_PLATFORMS = ["x", "instagram", "blog"] as const;
export type MarketingPlatform = (typeof MARKETING_PLATFORMS)[number];

export const MARKETING_CONTENT_FORMATS = [
  "roast_hook",
  "swap_spotlight",
  "mulligan_math",
  "commander_spotlight",
  "tool_demo",
] as const;
export type MarketingContentFormat = (typeof MARKETING_CONTENT_FORMATS)[number];

export const marketingPrimaryCtaSchema = z.object({
  link_key: z.string().min(1),
  landing_url: z.string().url(),
  rationale: z.string().min(1),
});

export const marketingSocialRepurposeSchema = z.object({
  x_thread_bullets: z.array(z.string()).default([]),
  instagram_carousel_slides: z.array(z.string()).default([]),
});

export const MARKETING_DRAFT_STATUSES = [
  "draft",
  "approved",
  "rejected",
  "superseded",
  "posted",
] as const;
export type MarketingDraftStatus = (typeof MARKETING_DRAFT_STATUSES)[number];

export const marketingDraftSchema = z.object({
  platform: z.enum(MARKETING_PLATFORMS),
  content: z.string().min(1),
  title: z.string().optional(),
});

export const marketingBriefAiOutputSchema = z
  .object({
    summary: z.string().min(1),
    primary_cta: marketingPrimaryCtaSchema,
    content_format: z.enum(MARKETING_CONTENT_FORMATS),
    seo_target_keyword: z.string().optional(),
    social_repurpose: marketingSocialRepurposeSchema.optional(),
    trending_cards: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])).default([]),
    trending_topics: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])).default([]),
    opportunities: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])).default([]),
    drafts: z.array(marketingDraftSchema).min(3),
  })
  .refine(
    (data) => {
      const counts = { x: 0, instagram: 0, blog: 0 };
      for (const d of data.drafts) {
        if (d.platform in counts) counts[d.platform as keyof typeof counts] += 1;
      }
      return counts.x === 1 && counts.instagram === 1 && counts.blog === 1;
    },
    { message: "Exactly one draft required per platform: x, instagram, blog" }
  );

export type MarketingBriefAiOutput = z.infer<typeof marketingBriefAiOutputSchema>;

export type MarketingSignalRow = {
  id: string;
  source_id: string | null;
  source_type: string;
  title: string | null;
  url: string | null;
  raw_text: string | null;
  detected_cards: unknown;
  detected_topics: unknown;
  score: number;
  created_at: string;
};

export type MarketingPrimaryCta = {
  link_key: string;
  landing_url: string;
  rationale: string;
};

export type MarketingSocialRepurpose = {
  x_thread_bullets: string[];
  instagram_carousel_slides: string[];
};

export type MarketingBriefRow = {
  id: string;
  brief_date: string;
  summary: string | null;
  primary_cta: MarketingPrimaryCta | null;
  content_format: MarketingContentFormat | string | null;
  seo_target_keyword: string | null;
  social_repurpose: MarketingSocialRepurpose | null;
  trending_cards: unknown;
  trending_topics: unknown;
  opportunities: unknown;
  created_at: string;
};

export type MarketingDraftRow = {
  id: string;
  brief_id: string;
  platform: string;
  content: string;
  status: MarketingDraftStatus;
  notes: string | null;
  quality_flags: unknown;
  scheduled_for: string | null;
  campaign: string | null;
  copied_at: string | null;
  external_post_url: string | null;
  external_post_id: string | null;
  posted_at: string | null;
  superseded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingMetaSnapshot = {
  trending_cards: string[];
  trending_commanders: string[];
  new_set_breakouts: string[];
  meta_label: string | null;
  updated_at: Record<string, string | null>;
};

export function normalizeJsonList(values: unknown): unknown[] {
  if (!Array.isArray(values)) return [];
  return values;
}

export function stringifyBriefItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    if (typeof o.title === "string") return o.title;
    if (typeof o.name === "string") return o.name;
    if (typeof o.label === "string") return o.label;
    if (typeof o.text === "string") return o.text;
  }
  return JSON.stringify(item);
}
