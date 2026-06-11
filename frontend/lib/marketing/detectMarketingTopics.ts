export const MARKETING_TOPICS = [
  "commander",
  "deckbuilding",
  "budget",
  "rules",
  "card-price",
  "collection",
  "beginner-help",
  "tournament",
  "meta",
  "app-feature-opportunity",
] as const;

export type MarketingTopic = (typeof MARKETING_TOPICS)[number];

const TOPIC_PATTERNS: Array<{ topic: MarketingTopic; patterns: RegExp[] }> = [
  {
    topic: "commander",
    patterns: [/\bcommander\b/i, /\bedh\b/i, /\bbrawl\b/i, /\bpartner\b/i],
  },
  {
    topic: "deckbuilding",
    patterns: [
      /\bdeck\s*build/i,
      /\bdecklist\b/i,
      /\bmana base\b/i,
      /\bcuts\b/i,
      /\bwhat should i remove\b/i,
      /\bslot\b/i,
    ],
  },
  {
    topic: "budget",
    patterns: [/\bbudget\b/i, /\bcheap\b/i, /\bafford/i, /\bunder \$\d+/i, /\bproxy\b/i],
  },
  {
    topic: "rules",
    patterns: [/\brules\b/i, /\bstack\b/i, /\btrigger\b/i, /\blegal\b/i, /\binteraction\b/i],
  },
  {
    topic: "card-price",
    patterns: [/\bprice\b/i, /\bspike\b/i, /\bfinance\b/i, /\bworth it\b/i, /\bmarket\b/i],
  },
  {
    topic: "collection",
    patterns: [/\bcollection\b/i, /\bbinder\b/i, /\borganiz/i, /\btrack/i],
  },
  {
    topic: "beginner-help",
    patterns: [/\bnew player\b/i, /\bbeginner\b/i, /\bhelp\b/i, /\bconfused\b/i, /\bhow do i\b/i],
  },
  {
    topic: "tournament",
    patterns: [/\btournament\b/i, /\bcEDH\b/i, /\bcompetitive\b/i, /\bmeta\b/i],
  },
  {
    topic: "meta",
    patterns: [/\bmeta\b/i, /\btrending\b/i, /\btier list\b/i, /\bmost played\b/i],
  },
  {
    topic: "app-feature-opportunity",
    patterns: [
      /\bdeck analyzer\b/i,
      /\bscan\b/i,
      /\btrack prices\b/i,
      /\bwishlist\b/i,
      /\bcollection app\b/i,
      /\bdeck builder\b/i,
    ],
  },
];

export function detectMarketingTopics(text: string): MarketingTopic[] {
  const found = new Set<MarketingTopic>();
  for (const { topic, patterns } of TOPIC_PATTERNS) {
    if (patterns.some((p) => p.test(text))) found.add(topic);
  }
  return [...found];
}
