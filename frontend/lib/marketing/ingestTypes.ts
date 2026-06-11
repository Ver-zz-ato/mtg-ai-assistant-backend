export type IngestError = { sourceId: string; name: string; error: string };

export type IngestResult = {
  inserted: number;
  skipped: number;
  errors: IngestError[];
};

export type MarketingSourceRow = {
  id: string;
  type: string;
  name: string;
  url: string | null;
  enabled: boolean;
  last_fetched_at: string | null;
  fetch_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export function mergeIngestResults(...parts: IngestResult[]): IngestResult {
  return parts.reduce(
    (acc, p) => ({
      inserted: acc.inserted + p.inserted,
      skipped: acc.skipped + p.skipped,
      errors: [...acc.errors, ...p.errors],
    }),
    { inserted: 0, skipped: 0, errors: [] as IngestError[] }
  );
}
