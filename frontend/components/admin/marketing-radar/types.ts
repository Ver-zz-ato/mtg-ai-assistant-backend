"use client";

import type { IngestResult } from "@/lib/marketing/ingestTypes";
import type {
  MarketingBriefRow,
  MarketingDraftRow,
  MarketingMetaSnapshot,
  MarketingSignalRow,
} from "@/lib/marketing/marketingBriefSchema";

export type BriefHistoryItem = {
  id: string;
  brief_date: string;
  summary: string | null;
  created_at: string;
  draft_count: number;
  summary_preview: string;
};

export type RadarPayload = {
  ok: boolean;
  latest_brief: MarketingBriefRow | null;
  drafts: MarketingDraftRow[];
  drafts_by_platform: Record<string, MarketingDraftRow[]>;
  recent_signals: MarketingSignalRow[];
  brief_history: BriefHistoryItem[];
  sources: unknown[];
  meta_snapshot: MarketingMetaSnapshot;
  calendar_drafts: MarketingDraftRow[];
  config?: {
    youtube_api_key_configured?: boolean;
    reddit_api_configured?: boolean;
    reddit_partial_configured?: boolean;
    publish?: {
      x?: boolean;
      instagram?: boolean;
      blog?: boolean;
      discord_notify?: boolean;
    };
  };
  error?: string;
};

export type IngestSummary = IngestResult & { skippedReason?: string };

export type DailySummary = {
  rss: IngestResult;
  youtube: IngestSummary;
  reddit: IngestResult;
  brief: { created: boolean; briefId?: string; draftCount?: number; error?: string } | null;
};

export const PLATFORM_LABELS: Record<string, string> = {
  x: "X (Twitter)",
  instagram: "Instagram",
  blog: "Blog",
};

export function statusBadgeClass(status: string): string {
  if (status === "posted") return "bg-blue-900/50 text-blue-200 border-blue-800";
  if (status === "approved") return "bg-emerald-900/60 text-emerald-300 border-emerald-700";
  if (status === "rejected") return "bg-red-900/40 text-red-300 border-red-800";
  if (status === "superseded") return "bg-neutral-800/60 text-neutral-500 border-neutral-700";
  return "bg-neutral-800 text-neutral-300 border-neutral-600";
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function formatIngestSummary(label: string, r: IngestSummary): string {
  if (r.skippedReason === "missing_api_key") return `${label}: skipped (YOUTUBE_API_KEY not set)`;
  if (r.skippedReason === "missing_api_credentials") {
    return `${label}: skipped (Reddit not configured — see Setup tab)`;
  }
  if (r.skippedReason === "incomplete_api_credentials") {
    return `${label}: skipped (set REDDIT_CLIENT_ID, SECRET, USERNAME, PASSWORD)`;
  }
  const errPart = r.errors.length ? `; ${r.errors.length} source error(s)` : "";
  return `${label}: +${r.inserted} inserted, ${r.skipped} skipped${errPart}`;
}
