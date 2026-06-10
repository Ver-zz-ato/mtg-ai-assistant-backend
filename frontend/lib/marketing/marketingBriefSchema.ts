import { z } from "zod";

export const MARKETING_PLATFORMS = ["x", "instagram", "blog", "reddit"] as const;
export type MarketingPlatform = (typeof MARKETING_PLATFORMS)[number];

export const MARKETING_DRAFT_STATUSES = ["draft", "approved", "rejected"] as const;
export type MarketingDraftStatus = (typeof MARKETING_DRAFT_STATUSES)[number];

export const marketingDraftSchema = z.object({
  platform: z.enum(MARKETING_PLATFORMS),
  content: z.string().min(1),
});

export const marketingBriefAiOutputSchema = z.object({
  summary: z.string().min(1),
  trending_cards: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])).default([]),
  trending_topics: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])).default([]),
  opportunities: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])).default([]),
  drafts: z.array(marketingDraftSchema).min(1),
});

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

export type MarketingBriefRow = {
  id: string;
  brief_date: string;
  summary: string | null;
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
