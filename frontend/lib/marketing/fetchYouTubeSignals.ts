import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestResult, MarketingSourceRow } from "./ingestTypes";
import { insertMarketingSignal, updateSourceFetchStatus } from "./marketingSignalInsert";

export type YouTubeIngestResult = IngestResult & {
  skippedReason?: "missing_api_key";
};

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    channelTitle?: string;
  };
};

export function isYouTubeApiKeyConfigured(): boolean {
  return !!String(process.env.YOUTUBE_API_KEY || "").trim();
}

async function resolveYouTubeChannelId(
  apiKey: string,
  source: MarketingSourceRow
): Promise<string> {
  const existing = String(source.metadata?.channelId ?? "").trim();
  if (existing) return existing;

  const handle = String(source.metadata?.handle ?? "")
    .trim()
    .replace(/^@/, "");
  if (!handle) return "";

  const params = new URLSearchParams({ part: "id", forHandle: handle, key: apiKey });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) return "";
  const json = (await res.json()) as { items?: Array<{ id?: string }> };
  return String(json.items?.[0]?.id ?? "").trim();
}

export async function fetchYouTubeSignals(admin: SupabaseClient): Promise<YouTubeIngestResult> {
  const apiKey = String(process.env.YOUTUBE_API_KEY || "").trim();
  if (!apiKey) {
    return { inserted: 0, skipped: 0, errors: [], skippedReason: "missing_api_key" };
  }

  const result: YouTubeIngestResult = { inserted: 0, skipped: 0, errors: [] };

  const { data: sources, error } = await admin
    .from("marketing_sources")
    .select("id, type, name, url, enabled, metadata")
    .eq("type", "youtube_channel")
    .eq("enabled", true);

  if (error) throw new Error(error.message);

  for (const raw of sources ?? []) {
    const source = raw as MarketingSourceRow;
    const channelId = await resolveYouTubeChannelId(apiKey, source);
    if (!channelId) {
      result.errors.push({
        sourceId: source.id,
        name: source.name,
        error: "missing_channelId (set metadata.channelId or handle)",
      });
      continue;
    }

    try {
      const params = new URLSearchParams({
        key: apiKey,
        part: "snippet",
        channelId,
        order: "date",
        type: "video",
        maxResults: "10",
      });
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`YouTube API ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = (await res.json()) as { items?: YouTubeSearchItem[] };
      for (const item of json.items ?? []) {
        const videoId = item.id?.videoId;
        if (!videoId) continue;
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const snippet = item.snippet;
        try {
          const inserted = await insertMarketingSignal(admin, {
            source_id: source.id,
            source_type: "youtube_channel",
            title: snippet?.title ?? "(untitled video)",
            url,
            raw_text: snippet?.description ?? snippet?.title ?? "",
            sourceMetadata: source.metadata,
            publishedAt: snippet?.publishedAt ?? null,
          });
          if (inserted === "skipped") result.skipped += 1;
          else result.inserted += 1;
        } catch (e) {
          result.errors.push({
            sourceId: source.id,
            name: source.name,
            error: e instanceof Error ? e.message : "insert_failed",
          });
        }
      }
      await updateSourceFetchStatus(admin, source.id, true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fetch_failed";
      result.errors.push({ sourceId: source.id, name: source.name, error: msg });
      await updateSourceFetchStatus(admin, source.id, false, msg);
    }
  }

  return result;
}
