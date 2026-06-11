import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichMarketingSignal } from "./enrichMarketingSignal";
import type { MarketingSignalRow } from "./marketingBriefSchema";

export type IngestManualSignalInput = {
  title?: string | null;
  url?: string | null;
  raw_text: string;
  source_name?: string | null;
};

function titleFromText(raw: string, explicit?: string | null): string | null {
  const t = explicit?.trim();
  if (t) return t.slice(0, 200);
  const firstLine = raw.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (!firstLine) return null;
  return firstLine.slice(0, 120);
}

export async function ingestManualSignal(
  admin: SupabaseClient,
  input: IngestManualSignalInput
): Promise<MarketingSignalRow> {
  const raw_text = input.raw_text.trim();
  if (!raw_text) throw new Error("raw_text is required");

  let source_id: string | null = null;
  const { data: manualSource } = await admin
    .from("marketing_sources")
    .select("id, metadata")
    .eq("type", "manual")
    .limit(1)
    .maybeSingle();

  const sourceMeta =
    manualSource && typeof (manualSource as { metadata?: unknown }).metadata === "object"
      ? ((manualSource as { metadata: Record<string, unknown> }).metadata ?? {})
      : {};

  if (manualSource && typeof (manualSource as { id?: string }).id === "string") {
    source_id = (manualSource as { id: string }).id;
  }

  const enriched = await enrichMarketingSignal(admin, {
    text: raw_text,
    sourceType: "manual",
    sourceMetadata: sourceMeta,
  });

  const row = {
    source_id,
    source_type: "manual",
    title: titleFromText(raw_text, input.title),
    url: input.url?.trim() || null,
    raw_text,
    detected_cards: enriched.detected_cards,
    detected_topics: enriched.detected_topics,
    score: enriched.score,
  };

  const { data, error } = await admin.from("marketing_signals").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data as MarketingSignalRow;
}
