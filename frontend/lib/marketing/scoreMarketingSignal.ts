import type { DetectedCard } from "./detectMarketingCards";
import type { MarketingTopic } from "./detectMarketingTopics";

const SOURCE_TYPE_WEIGHT: Record<string, number> = {
  reddit_subreddit: 25,
  reddit: 25,
  manual: 22,
  youtube_channel: 18,
  youtube: 18,
  rss: 12,
  internal: 5,
};

const PAIN_KEYWORDS = [
  "help",
  "upgrade",
  "budget",
  "confused",
  "rules",
  "deck",
  "mana base",
  "cuts",
  "what should i remove",
  "is this worth it",
  "struggling",
  "advice",
];

const DECK_TERMS = ["commander", "edh", "decklist", "deck building", "mana curve", "ramp"];

export type ScoreInput = {
  sourceType: string;
  sourceMetadata?: Record<string, unknown>;
  text: string;
  detectedCards: DetectedCard[];
  detectedTopics: MarketingTopic[];
  publishedAt?: string | null;
  engagementScore?: number | null;
};

export function scoreMarketingSignal(input: ScoreInput): number {
  let score = SOURCE_TYPE_WEIGHT[input.sourceType] ?? 8;

  const priority = Number(input.sourceMetadata?.priority ?? 0);
  if (priority >= 1 && priority <= 3) {
    score += (4 - priority) * 5;
  }

  if (input.publishedAt) {
    const ageMs = Date.now() - new Date(input.publishedAt).getTime();
    if (ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000) score += 15;
    else if (ageMs < 72 * 60 * 60 * 1000) score += 8;
  }

  if (input.engagementScore != null && input.engagementScore > 0) {
    score += Math.min(20, Math.log10(input.engagementScore + 1) * 8);
  }

  const lower = input.text.toLowerCase();
  let painHits = 0;
  for (const kw of PAIN_KEYWORDS) {
    if (lower.includes(kw)) painHits += 1;
  }
  score += Math.min(15, painHits * 3);

  if (DECK_TERMS.some((t) => lower.includes(t))) score += 5;

  const verifiedCards = input.detectedCards.filter((c) => c.verified).length;
  score += Math.min(15, verifiedCards * 5);

  if (input.detectedTopics.includes("app-feature-opportunity")) score += 8;
  if (input.detectedTopics.includes("beginner-help")) score += 4;

  return Math.round(score * 10) / 10;
}
