export type ExternalDeckSourceKey = "archidekt" | "moxfield";

export type ExternalDeckCard = {
  name: string;
  quantity: number;
  board: "mainboard" | "sideboard" | "commander" | "maybeboard";
  category?: string | null;
};

export type NormalizedExternalDeck = {
  sourceKey: ExternalDeckSourceKey;
  externalId: string;
  url: string;
  title?: string | null;
  ownerName?: string | null;
  format?: string | null;
  commanders: string[];
  cards: ExternalDeckCard[];
  publishedAt?: string | null;
  externalUpdatedAt?: string | null;
  sourcePayload?: Record<string, unknown>;
};

export type ParsedExternalDeckUrl = {
  sourceKey: ExternalDeckSourceKey;
  externalId: string;
  canonicalUrl: string;
};

export type ExternalDeckSourceRow = {
  source_key: ExternalDeckSourceKey;
  display_name: string;
  enabled: boolean;
  discovery_enabled: boolean;
  approved_for_profiles: boolean;
  cooldown_until: string | null;
  min_delay_ms: number;
  max_decks_per_run: number;
  max_discovery_pages_per_run: number;
  consecutive_failures: number;
  last_error: string | null;
};

export type ExternalDeckIngestSummary = {
  queued: number;
  processed: number;
  insertedOrUpdated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  discovered: number;
  rollupsWritten: number;
  profilesWritten: number;
  profileRegenerationMode?: "full" | "touched" | "none";
  touchedCommanders?: string[];
  errors: string[];
};

export type ExclusionReason =
  | "duplicate_deck_hash"
  | "invalid_format"
  | "missing_commander"
  | "parse_failure"
  | "too_few_cards"
  | "private_unavailable"
  | "unsupported_source";

export type ExternalCommanderCoverageBucket =
  | "eligible"
  | "needs_confidence_review"
  | "usable_qa"
  | "early_signal"
  | "not_ready";

export type ExternalCommanderCoverageTarget = {
  rank: number;
  commander: string;
  commander_key: string;
  popularity_score: number;
  approved_sample_size: number;
  confidence_score: number;
  readiness_bucket: ExternalCommanderCoverageBucket;
  needed_to_50: number;
  community_profile_eligible: boolean;
  warnings: string[];
};

export type ExternalCommanderCoverageSummary = {
  total: number;
  eligible: number;
  near_eligible: number;
  early_signal: number;
  not_ready: number;
  needs_confidence_review: number;
};

export type ExternalCommanderCoverageReport = {
  top100: ExternalCommanderCoverageTarget[];
  top250: ExternalCommanderCoverageTarget[];
  top100_summary: ExternalCommanderCoverageSummary;
  top250_summary: ExternalCommanderCoverageSummary;
  community_profile_eligible_count: number;
  remaining_growth_opportunities: number;
};
