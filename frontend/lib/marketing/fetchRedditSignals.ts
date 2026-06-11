import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestResult, MarketingSourceRow } from "./ingestTypes";
import { insertMarketingSignal, updateSourceFetchStatus } from "./marketingSignalInsert";

const REDDIT_UA =
  process.env.MARKETING_RADAR_REDDIT_UA ||
  "ManaTapMarketingRadar/1.0 (admin signal analysis; +https://manatap.ai)";

type RedditListing = {
  data?: {
    children?: Array<{
      data?: {
        title?: string;
        selftext?: string;
        url?: string;
        permalink?: string;
        score?: number;
        created_utc?: number;
        subreddit?: string;
      };
    }>;
  };
};

export async function fetchRedditSignals(admin: SupabaseClient): Promise<IngestResult> {
  const result: IngestResult = { inserted: 0, skipped: 0, errors: [] };

  const { data: sources, error } = await admin
    .from("marketing_sources")
    .select("id, type, name, url, enabled, metadata")
    .eq("type", "reddit_subreddit")
    .eq("enabled", true);

  if (error) throw new Error(error.message);

  for (const raw of sources ?? []) {
    const source = raw as MarketingSourceRow;
    const subreddit = String(source.metadata?.subreddit ?? "").trim();
    const sort = String(source.metadata?.sort ?? "hot");
    const limit = Math.min(50, Math.max(1, Number(source.metadata?.limit ?? 25)));

    if (!subreddit) {
      result.errors.push({ sourceId: source.id, name: source.name, error: "missing_subreddit" });
      continue;
    }

    try {
      const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${sort}.json?limit=${limit}&raw_json=1`;
      const res = await fetch(url, {
        headers: { "User-Agent": REDDIT_UA, Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Reddit HTTP ${res.status}`);
      }
      const json = (await res.json()) as RedditListing;
      const posts = json.data?.children ?? [];

      for (const child of posts) {
        const post = child.data;
        if (!post) continue;
        const permalink = post.permalink
          ? `https://www.reddit.com${post.permalink}`
          : post.url ?? null;
        if (!permalink) continue;

        const publishedAt = post.created_utc
          ? new Date(post.created_utc * 1000).toISOString()
          : null;

        try {
          const inserted = await insertMarketingSignal(admin, {
            source_id: source.id,
            source_type: "reddit_subreddit",
            title: post.title ?? "(untitled)",
            url: permalink,
            raw_text: post.selftext || post.title || "",
            sourceMetadata: { ...source.metadata, subreddit: post.subreddit ?? subreddit },
            publishedAt,
            engagementScore: post.score ?? null,
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

    await new Promise((r) => setTimeout(r, 1100));
  }

  return result;
}
