# External Deck Meta Ingest

External deck meta is a QA-first admin pipeline. It stores public deck data from approved external sources for commander comparison work, but it does not power public Discover or `meta_signals`.

Deck Analysis may read approved `external_commander_profiles` only through the beta comparison block, gated by `app_config.flags.deck_analysis_commander_comparison_beta === true` plus minimum sample/confidence thresholds. Website and mobile responses are sanitized and do not expose confidence, source breakdowns, warnings, support gaps, or QA-only fields.

## Flow

`external_decks` -> `external_deck_cards` -> `external_meta_rollups_daily` -> `external_commander_profiles` -> approved beta comparison.

Public claims must use `external_commander_profiles.approved_sample_size`, never `raw_sample_size`.

## Admin

- Page: `/admin/datadashboard/external-deck-meta`
- Queue endpoint: `POST /api/admin/data/external-deck-meta/queue`
- Manual run endpoint: `POST /api/admin/data/external-deck-meta/run`
- Status endpoint: `GET /api/admin/data/external-deck-meta/status`
- Profile approval endpoint: `POST /api/admin/data/external-deck-meta/profiles/[id]/approval`

All admin mutations require same-origin CSRF and admin auth.

## Cron

- Path: `/api/cron/external-deck-meta`
- Schedule: every 4 hours at minute 17
- Auth: `Authorization: Bearer <CRON_SECRET>`

## Source Rules

- Archidekt: queued URLs plus conservative recent discovery.
- Moxfield: queued public URLs only. No search, discovery, crawling, proxying, or bot-protection bypass in V1.
- On `429`, respect `Retry-After` when present, otherwise cool down for 6 hours.
- On repeated `403`, timeouts, or bot-protection-like failures, cool down for 24 hours and mark the source unhealthy.

## Tables

- `external_deck_sources`
- `external_deck_ingest_queue`
- `external_decks`
- `external_deck_cards`
- `external_meta_rollups_daily`
- `external_commander_profiles`

All tables are service-role-only with RLS enabled.
