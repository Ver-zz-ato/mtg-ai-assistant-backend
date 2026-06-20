# External Deck Meta Ingest

External deck meta is a QA-first admin pipeline. It stores public deck data from approved external sources for commander comparison work, but it does not power public Discover or `meta_signals`.

Deck Analysis may read approved `external_commander_profiles` only through the beta comparison block, gated by `app_config.flags.deck_analysis_commander_comparison_beta === true` plus minimum sample/confidence thresholds. Website and mobile responses are sanitized and do not expose confidence, source breakdowns, warnings, support gaps, or QA-only fields.

## Current Direction

Do not implement broad public Phase C blending yet. For now, continue external commander profile coverage growth and limited approved commander-page display only.

Phase C public blending is approved as a future plan, but it is blocked by readiness gates and must not rebuild ingestion, add new external ingest tables, or expose raw `external_decks` / `external_deck_cards` publicly.

Phase C1A is a commander-page-only beta: `/commanders/[slug]` may show a separate Community Profile section from approved `external_commander_profiles` behind `app_config.flags.commander_page_community_profile_beta === true`. This does not blend rankings, homepage meta movers, mobile Discover, `/api/meta/trending`, `meta_signals`, or website `/meta/*` ranking pages.

Phase C1/C2 implementation boundary:

- Website `/meta/trending-commanders` and `/meta/most-played-commanders` may apply a low-weight approved `external_commander_profiles` boost only when `app_config.flags.public_external_meta_enabled === true` and `app_config.flags.public_external_meta_surfaces.website_commander_meta_pages === true`.
- `/api/meta/trending` may compute and server-log a sanitized commander shadow report only when `app_config.flags.public_external_meta_enabled === true`, `app_config.flags.public_external_meta_shadow_mode === true`, and `app_config.flags.public_external_meta_surfaces.api_meta_trending_shadow === true`.
- `/api/meta/trending` public JSON is unchanged in C2; C3 low-weight API blending and C4 homepage inherited movers are not implemented yet.
- Rollback: set `public_external_meta_enabled` false, disable the specific surface flag, or set `public_external_meta_weight` to `0`.

## Flow

`external_decks` -> `external_deck_cards` -> `external_meta_rollups_daily` -> `external_commander_profiles` -> approved beta comparison.

Public claims must use `external_commander_profiles.approved_sample_size`, never `raw_sample_size`.

## Approved Phase C Plan: Public Meta Blending

Phase C may blend approved Archidekt-derived commander profile data into public meta surfaces only through a sanitized read layer. The source of truth for public external commander signals is approved `external_commander_profiles`; raw deck/card rows stay admin-only.

### Readiness Gates

- Minimum 25 Community Profile-eligible commanders before shadow mode.
- Minimum 50 Community Profile-eligible commanders before public blending.
- No mobile Discover changes until website `/api/meta/trending` has been stable with public blending for at least 7 days.

Community Profile-eligible means an approved commander profile that meets the public sample/confidence thresholds used by Deck Analysis Community Profile.

### Shared Safety Layer

Before any public surface changes, add a read-only sanitized helper that returns only eligible public fields from `external_commander_profiles`.

Allowed row criteria:

- `approved_for_public = true`
- `approved_sample_size >= 50`
- `confidence_score >= 0.55`
- Commander format only

Allowed public fields:

- `commander_name`
- `commander_name_norm`
- `approved_sample_size`
- sanitized `common_cards.name`
- sanitized `common_cards.inclusion_rate`
- sanitized `averages.lands`, `averages.ramp`, `averages.draw`, `averages.removal`, `averages.protection`
- `last_refreshed_at`
- derived public blend score

Never expose publicly:

- `raw_sample_size`
- confidence components
- profile warnings
- source breakdown
- exclusion reasons
- role variance
- support gaps
- raw deck IDs
- raw external deck/card rows

Suggested flags:

- `flags.public_external_meta_enabled`
- `flags.public_external_meta_shadow_mode`
- `flags.public_external_meta_weight`
- `flags.public_external_meta_surfaces`

Rollback is flag-only: disable `public_external_meta_enabled` or set the surface flag/weight to off so routes fall back to current `meta_signals`, `meta_commander_daily`, and `commander_aggregates`.

### Shadow Mode

Shadow mode computes blended candidates for admin/debug review without changing public output.

Track:

- current rank vs external-assisted rank
- top-10 overlap
- largest rank movement
- number of eligible external profiles used
- stale or missing profiles

Do not enable public output if more than roughly 20-30% of the top 10 changes unexpectedly, unless the change is explicitly reviewed.

### Surface Plan

1. `/api/meta/trending`
   - Use external data: yes, after gates.
   - Sanitized source: approved `external_commander_profiles`.
   - Fields: `name`, `slug`, `count`, optional `externalApprovedSampleSize`, `dataScope`.
   - Flag: `flags.public_external_meta_surfaces.api_meta_trending`.
   - Shock control: current `meta_signals` remains dominant; start weight at `0.1`, then `0.2`, max `0.35`.
   - Rollback: flag off or weight `0`.
   - Tests: response excludes QA fields, fallback works with no eligible profiles, rank movement cap, cache headers unchanged.

2. Website `/meta/*` pages
   - Use external data: yes for commander pages first; keep card pages unchanged until a separate card-level public rollup is approved.
   - Sanitized source: `meta_commander_daily` plus approved `external_commander_profiles`.
   - Fields: `name`, `slug`, `rank`, `metaLabel`, optional `approvedSampleSize`.
   - Flag: `flags.public_external_meta_surfaces.website_meta_pages`.
   - Shock control: external profile data boosts rather than replaces EDHREC-order daily rank.
   - Rollback: flag off returns to current `externalDailyMeta` behavior.
   - Tests: stable top N, no QA fields in props/HTML, commander pages blend while card pages remain unchanged.

3. Homepage meta movers
   - Use external data: yes indirectly.
   - Sanitized source: `/api/meta/trending`.
   - Fields: existing homepage response fields only.
   - Flag: inherited from `/api/meta/trending`.
   - Shock control: fallback to current API rows; do not show external sample counts in homepage copy initially.
   - Rollback: API flag off.
   - Tests: mocked blended API renders without layout changes and no QA fields.

4. Mobile Discover Meta
   - Use external data: yes, but only after website `/api/meta/trending` has been stable for at least 7 days.
   - Sanitized source: public backend meta API or blended `meta_signals`; do not query raw external tables.
   - Fields: keep the existing lightweight shape (`name`, `count`, `badge`, `movementLabel`, `priceLabel`, `dataScope`).
   - Flag: `flags.public_external_meta_surfaces.mobile_meta`.
   - Shock control: keep response shape backward-compatible; do not require new mobile fields.
   - Rollback: backend flag off.
   - Tests: mobile parser accepts old and blended shapes; Android/iOS Discover Meta manual checks.

5. Commander pages
   - Use external data: yes, as a separate approved Community Profile-style module, not as a replacement for ManaTap deck counts.
   - Sanitized source: approved `external_commander_profiles`.
   - Fields: `approved_sample_size`, sanitized `averages`, sanitized top `common_cards`, `last_refreshed_at`.
   - Flag: `flags.public_external_meta_surfaces.commander_pages`.
   - Shock control: do not change `Commander Intelligence` deck count or existing `commander_aggregates` labels in the first rollout.
   - Rollback: flag off hides the external profile module.
   - Tests: approved profile renders sanitized block; missing profile renders unchanged page; no QA fields in HTML.

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
