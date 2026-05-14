# Canonical AI Routes Reference

Last updated: 2026-05-14

This is the source-of-truth handover for ManaTap AI routes across the website backend and the mobile app. Future Codex work should start here before changing prompts, validators, cache keys, usage logging, or format support.

## Core Rules

1. Do not silently default unsupported formats to Commander in product routes. Use strict format normalization for route entrypoints.
2. Commander-only concepts must stay Commander-only: commander, color identity, singleton, command zone, commander tax, 100-card target.
3. Constructed formats mean Modern, Pioneer, Standard, and Pauper unless a route explicitly says otherwise. These use a 60-card mainboard target, 4-copy limit except basics, optional sideboard context, and no color identity.
4. Prompt text may guide the model, but server validators own correctness.
5. Shared deterministic deck facts should be preferred over route-specific regexes.
6. AI output that names cards must be legality-filtered against `scryfall_cache.legalities` plus curated ban overlays before returning to the client.
7. Mobile AI reports should cache by deck hash server-side before doing a fresh report when possible.

## Shared Building Blocks

### Format Rules

File: `frontend/lib/deck/formatRules.ts`

Supported first-class formats:

| Canonical | Analyze label | Main target | Max copies | Commander required | Color identity |
| --- | --- | ---: | ---: | --- | --- |
| `commander` | `Commander` | 100 | 1 | yes | yes |
| `modern` | `Modern` | 60 | 4 | no | no |
| `pioneer` | `Pioneer` | 60 | 4 | no | no |
| `standard` | `Standard` | 60 | 4 | no | no |
| `pauper` | `Pauper` | 60 | 4 | no | no |

Use `tryDeckFormatStringToAnalyzeFormat()` at route boundaries. Use `getFormatRules()` after the route has accepted the format. Avoid `deckFormatStringToAnalyzeFormat()` for request validation because it defaults unknown formats to Commander.

### Role Classifier

File: `frontend/lib/deck/role-classifier.ts`

This is the canonical classifier for deck roles used across AI routes:

- `land`
- `ramp`
- `draw`
- `tutor`
- `removal`
- `interaction`
- `protection`
- `recursion`
- `graveyard`
- `token`
- `engine`
- `combo`
- `wincon`
- `fixing`
- `hate`

It wraps `frontend/lib/deck/card-role-tags.ts`, which owns low-level oracle/type/keyword rules. Routes should call `classifyCardRoles()`, `summarizeDeckRoles()`, or `formatRoleSummaryForPrompt()` instead of rebuilding their own ramp/draw/removal/protection/wincon regexes.

Current users:

- Mulligan profile and hand facts: uses classifier with old curated heuristics as fallback.
- Finish Suggestions: passes canonical role counts into the prompt.
- Swap Suggestions: passes canonical role counts into the prompt and still validates suggestions by price, color identity where Commander, and legality.
- Health/Analyze deck facts: already route through `card-role-tags.ts` via deck facts; future changes should lift new route-facing role needs through `role-classifier.ts`.

### Deck Enrichment

File: `frontend/lib/deck/deck-enrichment.ts`

This fetches card facts from `scryfall_cache`:

- `type_line`
- `oracle_text`
- `color_identity`
- `cmc`
- `mana_cost`
- `legalities`
- `keywords`
- `is_land`
- `is_creature`

`is_land` and `is_creature` should be preferred when present. Type-line substring checks are fallback only.

### Legality Filter

File: `frontend/lib/deck/recommendation-legality.ts`

All suggested card names should pass:

1. Scryfall legality key for the user format.
2. Curated ban overlay from `get-banned-cards`.
3. Cache-row availability and populated legality data.

Unknown legality should be treated as not returnable for recommendations. This is intentionally conservative.

### Deck Context Summary

File: `frontend/lib/deck/deck-context-summary.ts`

This builds compact LLM grounding and is cached in `deck_context_summary` by `(deck_id, deck_hash)` for linked decks. It contains deck structure, curve, colors, role-ish counts, deck facts, synergy diagnostics, and card names.

Mobile report response caching is separate and uses `ai_private_cache` because it caches the final app-safe response envelope, not just facts.

## Route Matrix

### `POST /api/deck/analyze`

File: `frontend/app/api/deck/analyze/route.ts`

Purpose: Main website deck analysis route. Also used by mobile as the core engine.

Format support: Commander, Modern, Pioneer, Standard, Pauper.

Inputs:

- `deckText` or `deckId`
- `format`
- optional `commander`, `sourcePage`, `usageSource`

Important behavior:

- Loads `deck_cards` for `deckId` and excludes sideboard from analysis text.
- Strictly rejects unsupported formats.
- Builds and reuses `deck_context_summary` where possible.
- Filters recommendations for legality.
- Logs usage to `ai_usage`.

Risk notes:

- This is the highest blast-radius route. Prefer deterministic helpers and narrow prompt changes.
- Do not add Commander-only wording unless gated by `analyzeFormat === "Commander"`.

### `POST /api/mobile/deck/analyze`

File: `frontend/app/api/mobile/deck/analyze/route.ts`

Purpose: App-safe wrapper around `/api/deck/analyze`. It calls the core route, then generates mobile-friendly structured explanation via `generateAppSafeDeckExplanation()`.

Format support: Commander, Modern, Pioneer, Standard, Pauper.

Cache:

- Uses `ai_private_cache`.
- Cache key includes a route version, deck hash, format, commander hint, and source page.
- TTL: 12 hours.
- Cache is checked before the core analyzer runs.
- Only non-partial successful responses are written.
- Cached responses return `cacheHit: true` and `cacheKind: "mobile_deck_analyze"`.

Why this exists:

- The mobile app repeatedly asks for the same report while users revisit deck screens.
- Deck hash caching saves OpenAI usage and avoids duplicate report cost when the saved list has not changed.

### `POST /api/deck/transform`

File: `frontend/app/api/deck/transform/route.ts`

Purpose: Transform an existing deck into a full replacement list according to a user goal.

Format support: Commander, Modern, Pioneer, Standard, Pauper.

Commander behavior:

- Uses commander/color identity.
- Enforces Commander legality.
- Trims over-100 model output by quantity.
- Warns if final validated quantity is below 100.

Constructed behavior:

- No commander inference.
- No color identity filtering.
- Uses a 60-card mainboard target.
- Uses constructed copy-limit prompt rules.
- Runs legality filter for the selected format.
- Warns if final validated quantity is below 60.

Known limitation:

- The current transform parser returns a flat decklist and does not preserve a sideboard section. For constructed transform, treat output as mainboard-first. Add sideboard preservation only with parser and client contract updates.

### `POST /api/deck/finish-suggestions`

File: `frontend/app/api/deck/finish-suggestions/route.ts`

Purpose: Suggest cards to finish an incomplete deck.

Format support: Commander, Modern, Pioneer, Standard, Pauper.

Role handling:

- Enriches the current mainboard.
- Builds a canonical role summary.
- Includes that role summary in the prompt so suggestions avoid filling the wrong holes.

Validation:

- Existing copy counts are checked.
- Legality filter runs after AI output.
- Commander color identity is checked only for Commander.
- Price estimates are added where available.

### `POST /api/deck/swap-suggestions`

File: `frontend/app/api/deck/swap-suggestions/route.ts`

Purpose: Suggest cheaper replacements for expensive cards.

Format support: Commander and constructed formats through `normalizeManatapDeckFormatKey()`.

Role handling:

- Enriches deck names.
- Builds canonical role summary.
- Passes the summary to the AI prompt.
- Prompt requires same-role swaps: ramp for ramp, removal for removal, draw for draw, protection for protection, wincon for wincon.

Validation:

- Must be cheaper than the source card.
- Commander color identity is enforced only for Commander when commander colors are known.
- Legality filter runs for all returned replacement names.
- Detected combo pieces are protected from swaps.

### `POST /api/mulligan/advice`

Files:

- `frontend/app/api/mulligan/advice/route.ts`
- `frontend/lib/mulligan/advice-handler.ts`
- `frontend/lib/mulligan/deck-profile.ts`

Purpose: Opening-hand keep/mulligan advice.

Format support: Commander, Modern, Pioneer, Standard, Pauper at request level.

Role handling:

- `buildDeckProfileWithTypes()` and `computeHandFactsWithTypes()` now use the shared role classifier where enrichment is available.
- Old curated lists remain fallback to avoid breaking advice when cache rows are missing.

Risk notes:

- `DeckProfile.format` is still typed as `"commander"` in the profile object. The handler accepts multiple request formats, but profile semantics are still most mature for Commander. Future work should widen the profile type and tune constructed mulligan thresholds.

### Health Report Routes

Relevant files:

- `frontend/app/api/decks/health-report/route.ts`
- `frontend/lib/deck/deck-facts.ts`
- `frontend/lib/deck/card-role-tags.ts`

Purpose: Deterministic-ish deck health and facts.

Role handling:

- Already uses Scryfall-backed tags for ramp, draw, interaction, removal, protection, recursion, engines, and finishers.
- Future route-facing additions should use `role-classifier.ts` rather than adding another tag mapping.

## Cache Tables

### `deck_context_summary`

Use for deterministic deck context facts.

Key: `(deck_id, deck_hash)`.

Do not use this as a final AI response cache. It is grounding data, not the report itself.

### `ai_private_cache`

Use for private AI response caches.

Schema source: `docs/SUPABASE_SCHEMA.md`.

Important columns:

- `cache_key`
- `response_text`
- `response_meta`
- `expires_at`

Current mobile report cache:

- route: `/api/mobile/deck/analyze`
- key intent: `mobile_deck_analyze`
- TTL: 12 hours
- value: full mobile response body JSON string

## Testing

Relevant scripts from `frontend/package.json`:

- `npm run test:unit`
- `npm run verify:ai`
- `npm run verify:ai:strict`
- `npm run verify:ai-routes`
- `npm run test:comprehensive`
- `npm run test:comprehensive:full`
- `npm run build`
- `npm run lint`

Route-specific useful direct tests:

- `tsx tests/unit/role-classifier.test.ts`
- `tsx tests/unit/mulligan-advice-format.test.ts`
- `tsx tests/unit/finish-suggestions-core.test.ts`
- `tsx tests/unit/deck-analyze-route-regression.test.ts`
- `node scripts/verify-ai-route-responses.mjs`

Before merging AI route changes:

1. Run unit tests.
2. Run `verify:ai-routes`.
3. Run `build` or `tsc --noEmit` if build is too slow.
4. For prompt/response changes, inspect one Commander and one constructed route response manually if API keys/env are available.

## Future Work

1. Preserve sideboard sections in transform output for constructed formats.
2. Widen `DeckProfile.format` beyond `"commander"` and tune mulligan thresholds by format.
3. Move Analyze route prompt role grounding directly onto `role-classifier.ts` once its current deck facts contract is refactored.
4. Add cache-hit usage logging for mobile report cache hits if product analytics needs it.
5. Add a small route contract test that asserts `/api/deck/transform` does not reject Modern/Pioneer/Standard/Pauper at request validation time.
