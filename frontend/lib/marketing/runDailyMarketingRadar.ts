import type { SupabaseClient } from "@supabase/supabase-js";
import { createBriefAndDrafts } from "./createBriefAndDrafts";
import { fetchRedditSignals } from "./fetchRedditSignals";
import { fetchRssSignals } from "./fetchRssSignals";
import { fetchYouTubeSignals, type YouTubeIngestResult } from "./fetchYouTubeSignals";
import type { IngestResult } from "./ingestTypes";

export type DailyRadarSummary = {
  rss: IngestResult;
  youtube: YouTubeIngestResult;
  reddit: IngestResult;
  brief: { created: boolean; briefId?: string; draftCount?: number; error?: string } | null;
};

export async function runDailyMarketingRadar(
  admin: SupabaseClient,
  opts?: { userId?: string | null }
): Promise<DailyRadarSummary> {
  let rss: IngestResult = { inserted: 0, skipped: 0, errors: [] };
  let youtube: YouTubeIngestResult = { inserted: 0, skipped: 0, errors: [] };
  let reddit: IngestResult = { inserted: 0, skipped: 0, errors: [] };

  try {
    rss = await fetchRssSignals(admin);
  } catch (e) {
    rss.errors.push({
      sourceId: "rss",
      name: "rss_batch",
      error: e instanceof Error ? e.message : "rss_failed",
    });
  }

  try {
    youtube = await fetchYouTubeSignals(admin);
  } catch (e) {
    youtube.errors.push({
      sourceId: "youtube",
      name: "youtube_batch",
      error: e instanceof Error ? e.message : "youtube_failed",
    });
  }

  try {
    reddit = await fetchRedditSignals(admin);
  } catch (e) {
    reddit.errors.push({
      sourceId: "reddit",
      name: "reddit_batch",
      error: e instanceof Error ? e.message : "reddit_failed",
    });
  }

  let brief: DailyRadarSummary["brief"] = null;
  try {
    const result = await createBriefAndDrafts(admin, opts);
    if ("error" in result) {
      brief = { created: false, error: result.message };
    } else {
      brief = {
        created: true,
        briefId: result.brief.id,
        draftCount: result.drafts.length,
      };
    }
  } catch (e) {
    brief = {
      created: false,
      error: e instanceof Error ? e.message : "brief_failed",
    };
  }

  return { rss, youtube, reddit, brief };
}
