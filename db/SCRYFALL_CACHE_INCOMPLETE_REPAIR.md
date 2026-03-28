# scryfall_cache incomplete repair pass

**Route:** `POST /api/cron/scryfall-cache-incomplete-repair` (same auth as other crons: `x-cron-key` or admin session).

**Purpose:** Backfill rows where `type_line`, `oracle_text`, or both `small` / `normal` images are missing, using Scryfall `/cards/collection` + `mergeScryfallCacheRowFromApiCard` so **existing non-null fields are not replaced with nulls** (same merge rules as Phase 3 backfill).

**Does not replace** the weekly `default_cards` bulk import; it is a small, resumable repair job.

## Query (Postgres) — repair candidates

Strict NULL semantics (used by the API filter):

```sql
SELECT name, type_line, oracle_text, small, normal
FROM public.scryfall_cache
WHERE type_line IS NULL
   OR oracle_text IS NULL
   OR (small IS NULL AND normal IS NULL)
ORDER BY name
LIMIT 500;
```

The app also treats **blank** `type_line` / `oracle_text` as incomplete (`isScryfallCacheRowIncomplete` in `frontend/lib/server/scryfallCacheRow.ts`). Rows that are only “empty string” may not appear in the PostgREST filter above; re-run or use a SQL variant with `trim` if needed.

## Parameters

| Query param | Default | Max | Notes |
|-------------|---------|-----|--------|
| `batchSize` | 300 | 500 | Rows to process per request |
| `after` | — | — | Resume: only rows with `name` &gt; `after` (lexicographic PK) |

## API cost

Scryfall `/cards/collection` allows **75** identifiers per request. A batch of 300 ⇒ 4 HTTP calls per run.

## Idempotency

Re-running is safe: repaired rows no longer match the incomplete predicate; merge never clears good data when the API returns nulls.
