import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichMarketingSignal } from "./enrichMarketingSignal";
import type { MarketingSignalRow } from "./marketingBriefSchema";

export type SignalInsertInput = {
  source_id: string | null;
  source_type: string;
  title: string | null;
  url: string | null;
  raw_text: string | null;
  sourceMetadata?: Record<string, unknown>;
  publishedAt?: string | null;
  engagementScore?: number | null;
};

export async function signalUrlExists(admin: SupabaseClient, url: string): Promise<boolean> {
  if (!url?.trim()) return false;
  const { count, error } = await admin
    .from("marketing_signals")
    .select("id", { count: "exact", head: true })
    .eq("url", url.trim());
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function insertMarketingSignal(
  admin: SupabaseClient,
  input: SignalInsertInput
): Promise<MarketingSignalRow | "skipped"> {
  if (input.url && (await signalUrlExists(admin, input.url))) {
    return "skipped";
  }

  const text = [input.title, input.raw_text].filter(Boolean).join("\n\n");
  const enriched = await enrichMarketingSignal(admin, {
    text,
    sourceType: input.source_type,
    sourceMetadata: input.sourceMetadata,
    publishedAt: input.publishedAt,
    engagementScore: input.engagementScore,
  });

  const row = {
    source_id: input.source_id,
    source_type: input.source_type,
    title: input.title,
    url: input.url,
    raw_text: input.raw_text,
    detected_cards: enriched.detected_cards,
    detected_topics: enriched.detected_topics,
    score: enriched.score,
  };

  const { data, error } = await admin.from("marketing_signals").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data as MarketingSignalRow;
}

export async function updateSourceFetchStatus(
  admin: SupabaseClient,
  sourceId: string,
  ok: boolean,
  errorMessage?: string
): Promise<void> {
  const patch: Record<string, unknown> = {
    last_fetched_at: new Date().toISOString(),
    fetch_error: ok ? null : (errorMessage ?? "unknown_error"),
  };
  await admin.from("marketing_sources").update(patch).eq("id", sourceId);
}
