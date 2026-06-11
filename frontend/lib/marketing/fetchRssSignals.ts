import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRssFeedItems } from "./parseRssFeed";
import type { IngestResult, MarketingSourceRow } from "./ingestTypes";
import { insertMarketingSignal, updateSourceFetchStatus } from "./marketingSignalInsert";

export async function fetchRssSignals(admin: SupabaseClient): Promise<IngestResult> {
  const result: IngestResult = { inserted: 0, skipped: 0, errors: [] };

  const { data: sources, error } = await admin
    .from("marketing_sources")
    .select("id, type, name, url, enabled, metadata")
    .eq("type", "rss")
    .eq("enabled", true);

  if (error) throw new Error(error.message);

  for (const raw of sources ?? []) {
    const source = raw as MarketingSourceRow;
    const feedUrl = source.url?.trim();
    if (!feedUrl) {
      result.errors.push({ sourceId: source.id, name: source.name, error: "missing_feed_url" });
      continue;
    }

    try {
      const items = await fetchRssFeedItems(feedUrl);
      for (const item of items.slice(0, 30)) {
        if (!item.link) continue;
        try {
          const inserted = await insertMarketingSignal(admin, {
            source_id: source.id,
            source_type: "rss",
            title: item.title,
            url: item.link,
            raw_text: item.description || item.title,
            sourceMetadata: source.metadata,
            publishedAt: item.pubDate,
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
