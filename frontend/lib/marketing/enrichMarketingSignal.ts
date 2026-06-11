import type { SupabaseClient } from "@supabase/supabase-js";
import { detectMarketingCards } from "./detectMarketingCards";
import { detectMarketingTopics } from "./detectMarketingTopics";
import { scoreMarketingSignal } from "./scoreMarketingSignal";

export type EnrichResult = {
  detected_cards: Array<{ name: string; verified?: boolean }>;
  detected_topics: Array<string | Record<string, unknown>>;
  score: number;
};

export async function enrichMarketingSignal(
  admin: SupabaseClient | null,
  input: {
    text: string;
    sourceType: string;
    sourceMetadata?: Record<string, unknown>;
    publishedAt?: string | null;
    engagementScore?: number | null;
  }
): Promise<EnrichResult> {
  const detected_cards = await detectMarketingCards(admin, input.text);
  const topics = detectMarketingTopics(input.text);
  const detected_topics: Array<string | Record<string, unknown>> = [...topics];

  if (input.publishedAt) {
    detected_topics.push({ kind: "published_at", value: input.publishedAt });
  }
  if (input.sourceMetadata?.channelName) {
    detected_topics.push({ kind: "channel", value: String(input.sourceMetadata.channelName) });
  }
  if (input.sourceMetadata?.subreddit) {
    detected_topics.push({ kind: "subreddit", value: String(input.sourceMetadata.subreddit) });
  }

  const score = scoreMarketingSignal({
    sourceType: input.sourceType,
    sourceMetadata: input.sourceMetadata,
    text: input.text,
    detectedCards: detected_cards,
    detectedTopics: topics,
    publishedAt: input.publishedAt,
    engagementScore: input.engagementScore,
  });

  return { detected_cards, detected_topics, score };
}
