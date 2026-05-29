# Security advisor fixes — Phase A then Phase B

## Phase A (deploy website first)

Server routes write shared data with **service role** via `frontend/lib/server/serviceRoleSupabase.ts`:

- `scryfall_cache` upserts (cache warming, deck save/update, public deck page)
- `shoutbox_messages` insert/delete (post, auto-generate, cleanup, admin moderation)
- `price_snapshots` upserts (admin snapshot jobs, bulk snapshot helper)

Requires `SUPABASE_SERVICE_ROLE_KEY` in the website runtime (already used by crons).

## Phase B (SQL — after Phase A is live)

Apply `frontend/db/migrations/118_security_advisor_phase_b_writes.sql` in Supabase SQL editor or migration pipeline.

- Removes permissive client write policies on caches, shoutbox, snapshots
- Adds `service_role`-only write policies
- Keeps public **read** on `scryfall_cache`, `price_cache`, `shoutbox_messages`, `price_snapshots`
- Tightens `scan-index` storage to path-based public read (no bucket listing)
- Pins `search_path` on four advisor-flagged functions

**Do not run Phase B before Phase A** — shoutbox posts and cache warming will fail without service-role API writes.

## Smoke test

1. Website: post shoutbox message; admin delete a message
2. Website: open public deck (images load)
3. Website: save deck with a card missing from cache
4. Mobile: card search prices; scan manifest download
5. Admin: price snapshot build (if used)

## Security impact

- Closes client-side corruption of shared caches and shoutbox via anon/authenticated JWT
- Mobile unchanged (read-only on affected tables)
