# Discovery Flywheel — Implementation Handover

Summary of all discovery-related work for LLM context. Use this when extending, debugging, or changing discovery flows.

**Current phase:** 9.5 (Discovery Engine Hardening) — complete.

---

## Quick Reference: What Do I Do Now?

1. **Run the ingestion loop** (when you have GSC data):
   - Export queries from Google Search Console (Performance → Search results → Export)
   - `npx tsx scripts/ingest-gsc-queries.ts path/to/export.csv --direct`
   - `npx tsx scripts/publish-seo-pages.ts 25`
   - Or use admin UI: `/admin/seo/pages` → Generate → Publish top 25

2. **If no GSC export yet:** Use seed script to test:
   - `npx tsx scripts/seed-seo-queries.ts`
   - `npx tsx scripts/publish-seo-pages.ts 25`

3. **Watch for 2–3 weeks:** Check GSC for impressions/clicks on new `/q/` pages.

4. **Promote to index:** When confident, set `indexing: index` in admin for winners.

---

## 1. Commander Workspace Upgrade (Phase 1–2)

**Goal:** Upgrade commander pages into "Commander Workspaces" with richer at-a-glance context and tool CTAs.

### Commander Snapshot Card

- **File:** `frontend/app/commanders/[slug]/page.tsx`
- **Location:** Below intro text, above tools panel
- **Fields:** Gameplan, Core themes, Power style, Difficulty
- **Source:** Derived deterministically from `CommanderProfile` (colors, tags, blurb) via `deriveCommanderSnapshot()` in `frontend/lib/seo/commander-content.ts`
- **Fallback:** Generic values when profile fields are missing

### Live Commander Tools Panel

- **File:** `frontend/app/commanders/[slug]/page.tsx`
- **Location:** Below snapshot card, above fold
- **4 CTA cards (plain `<a>` links, crawlable):**
  - Browse Decks → `/decks/browse?search={Commander Name}`
  - Mulligan Simulator → `/tools/mulligan?commander={slug}`
  - Cost to Finish → `/collections/cost-to-finish?commander={slug}`
  - Budget Swaps → `/deck/swap-suggestions?commander={slug}`

### Popular Decks Section

- **File:** `frontend/app/commanders/[slug]/page.tsx`
- **Content:** SSR placeholder with intro text + link to `/decks/browse?search={Commander Name}`
- **Purpose:** Internal linking, engagement

### Strategy Snapshot

- **File:** `frontend/app/commanders/[slug]/page.tsx`
- **Source:** `renderStrategySnapshot()` in `frontend/lib/seo/commander-content.ts`
- **Content:** 2–3 sentence template-based SSR summary using commander themes
- **No AI usage**

### ToolStrip Compact Variant

- **File:** `frontend/app/commanders/[slug]/page.tsx`
- **Component:** `components/ToolStrip.tsx` (variant="compact")
- **Location:** Below Commander Tools panel
- **Purpose:** Reinforce tools cluster linking, reduce crawl depth

---

## 2. Discovery Flywheel Phase 3

### /tools Index Page

- **File:** `frontend/app/tools/page.tsx` (created)
- **Route:** `/tools`
- **Content:** H1 "MTG Tools", ~200-word intro (SSR), list of 5 tools with descriptions and plain `<a>` links:
  - Mulligan Simulator
  - Probability Calculator
  - Cost to Finish
  - Budget Swap Optimizer
  - Price Tracker

### Popular Commanders on Tool Pages

- **Component:** `frontend/components/PopularCommanders.tsx`
- **Usage:** Rendered on 5 tool pages:
  - `/tools/mulligan` (layout)
  - `/tools/probability` (layout)
  - `/price-tracker` (layout)
  - `/collections/cost-to-finish` (page)
  - `/deck/swap-suggestions` (page)
- **Content:** 8–10 commander links from `COMMANDERS` in `lib/commanders.ts`
- **Intro text:** "Common commander shells people use this tool for."
- **Links:** Plain `<a>` to `/commanders/{slug}`

### Commanders in Global Nav

- **File:** `frontend/components/Header.tsx`
- **Location:** Desktop nav (after What's New) and mobile menu
- **Link:** `/commanders` — crawlable `<a>`, label "Commanders"

### Commander Content Page CTA Hierarchy (Cost Protection)

- **Files:** `frontend/app/commanders/[slug]/mulligan-guide/page.tsx`, `budget-upgrades/page.tsx`, `best-cards/page.tsx`
- **CTA order:**
  - **Primary:** Browse decks (links to `/decks/browse?search={name}`)
  - **Secondary:** Mulligan Simulator, Cost to Finish (with `?commander={slug}`)
- **Note:** "No signup required to try tools."
- **Intent:** Avoid pushing AI chat as primary CTA; route to low-cost tool actions first

### Sitemap (Scalable Index)

- **File:** `frontend/app/sitemap.ts`
- **Structure:** Sitemap index at `/sitemap.xml`; segments at `/sitemap/[id].xml`
- **Segments (initial):**
  - `static` — homepage, pricing, tools index, commanders index, intent pages, blog
  - `tools` — tool routes
  - `commanders` — commander hub pages
  - `commander-content` — mulligan-guide, budget-upgrades, best-cards per commander
  - `decks-recent` — public decks updated in last 30 days (capped 300)
- **Canonical host:** `https://www.manatap.ai` everywhere

---

## 3. Commander Aggregates (Phase 4)

### Cached Aggregates per Commander

- **Table:** `commander_aggregates` (migration `042_commander_aggregates.sql`)
- **Columns:** `commander_slug`, `top_cards` (jsonb), `deck_count`, `recent_decks` (jsonb), `updated_at`
- **Data source:** Public decks (`decks` + `deck_cards`), matched by `commander ilike commanderName`
- **Aggregates:** `topCards` (top 20), `deckCount`, `recentDecks` (6 most recent)
- **Note:** `medianCost` omitted (deck cost not stored; would require price joins)

### Caching

- **Lib:** `lib/commander-aggregates.ts` — `getCommanderAggregates(slug)`
- **Cron:** `POST/GET /api/cron/commander-aggregates` (daily 5:00 UTC via Vercel)
- **Refresh:** Run cron manually with `x-cron-key` header or `?key=CRON_KEY`

### Commander Hub UI

- **File:** `frontend/app/commanders/[slug]/page.tsx`
- **Sections (SSR):**
  - **Most Played Cards** — top 12 with inclusion %
  - **Recent Decks** — 6 links to `/decks/[id]`
- **Typical Deck Cost Range:** Omitted (no cost data in aggregates)

---

## 4. Commander Art (Phase 5)

### Commander Art Banner on Pages

- **Component:** `frontend/components/CommanderArtBanner.tsx`
- **Usage:** Commander hub + 3 content pages (mulligan-guide, budget-upgrades, best-cards)
- **Data source:** `getImagesForNamesCached([name])` from `lib/server/scryfallCache.ts` (uses `scryfall_cache` table, falls back to Scryfall API)
- **Image:** `art_crop` preferred, then `normal`, then `small`
- **Layout:** Full-width banner with gradient overlay, similar to deck header on `/deck/swap-suggestions`

### Commander Hover Preview on Links

- **Component:** `frontend/components/CommanderLinkWithHover.tsx` (client)
- **Usage:** `/commanders` index page and `PopularCommanders` component
- **Behavior:** On hover, fetches `/api/commander-art?name=X` and shows floating card preview (image + name)

### Commander Art API

- **File:** `frontend/app/api/commander-art/route.ts`
- **Route:** `GET /api/commander-art?name={encoded name}`
- **Response:** `{ ok: boolean, art: string | null }`
- **Implementation:** Uses `getImagesForNamesCached` from `lib/server/scryfallCache`
- **Hardening:**
  - Input validation: reject empty, max length 120, strip control chars
  - Success: `Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800` (browser 1d, CDN 7d)
  - Errors: `Cache-Control: no-store`

---

## 5. Archetypes, Strategies, Cards, Meta (Phase 6–7)

### Commander Archetypes

- **Route:** `/commander-archetypes`, `/commander-archetypes/[slug]`
- **File:** `frontend/app/commander-archetypes/page.tsx`, `[slug]/page.tsx`
- **Data:** `lib/data/archetypes.ts` — `ARCHETYPES` (slug, title, tagMatches, intro)
- **Content:** Long-form intro per archetype (dragons, aristocrats, treasure, spellslinger, elfball, tokens, sacrifice, reanimator, artifacts, enchantress)
- **Sitemap:** `archetypes` segment

### Strategies

- **Route:** `/strategies`, `/strategies/[slug]`
- **File:** `frontend/app/strategies/page.tsx`, `[slug]/page.tsx`
- **Data:** `lib/data/strategies.ts` — `STRATEGIES` (ramp, tokens, sacrifice, control, aggro, combo)
- **Content:** Long-form intro per strategy
- **Sitemap:** `strategies` segment

### Card Pages

- **Route:** `/cards`, `/cards/[slug]`
- **File:** `frontend/app/cards/page.tsx`, `[slug]/page.tsx`
- **Data:** `lib/top-cards.ts` — `getTopCards()` from `top_cards` table (migration `045_top_cards.sql`)
- **Content:** Card name, deck count, commander overlap
- **Sitemap:** `cards` segment

### Meta Signals

- **Route:** `/meta`
- **File:** `frontend/app/meta/page.tsx`, `[slug]/page.tsx`
- **Data:** `meta_signals` table (migration `044_meta_signals.sql`)
- **Slugs:** `trending-commanders`, `most-played-commanders`, `budget-commanders`, `trending-cards`, `most-played-cards`
- **Sitemap:** `meta` segment

---

## 6. Query Harvesting & SEO Pages (Phase 8–9)

### seo_queries Table

- **Migration:** `047_seo_queries.sql`
- **Columns:** `id`, `query`, `clicks`, `impressions`, `ctr`, `position`, `source` (default `gsc`), `date_start`, `date_end`, `created_at`, `updated_at`
- **Unique:** `(source, query)` — upsert on ingest
- **Purpose:** Store GSC search query data for intent-based landing page generation

### seo_pages Table

- **Migration:** `048_seo_pages.sql`, `049_seo_pages_resolver_quality.sql`
- **Columns:** `id`, `slug`, `title`, `description`, `template`, `query`, `commander_slug`, `card_name`, `archetype_slug`, `strategy_slug`, `priority`, `status` (draft|published|disabled), `quality_score`, `indexing` (index|noindex), `resolved_url`, `created_at`, `updated_at`
- **Purpose:** Auto-generated landing pages at `/q/[slug]` driven by GSC queries

### Ingest Script

- **File:** `frontend/scripts/ingest-gsc-queries.ts`
- **Usage:** `npx tsx scripts/ingest-gsc-queries.ts path/to/gsc-export.csv [baseUrl] [--direct]`
- **With --direct:** Uses Supabase directly (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). No auth required.
- **Without --direct:** POSTs to `/api/admin/seo-queries/ingest` (requires admin auth cookie).
- **GSC CSV columns:** Query, Clicks, Impressions, CTR, Position (case-insensitive)

### Ingest API

- **Route:** `POST /api/admin/seo-queries/ingest`
- **Body:** `{ rows: [{ query, clicks, impressions, ctr?, position? }] }`
- **Auth:** Admin required

### Query Classifier

- **File:** `lib/seo/queryClassifier.ts`
- **Input:** Raw query string, optional `topCardNames`
- **Output:** `ClassifierResult | null` — `type`, `entities`, `confidence` (high|medium|low)
- **Templates:** `commander_mulligan`, `commander_budget`, `commander_cost`, `commander_best_cards`, `card_price`, `card_decks`, `archetype`, `strategy`, `tool_generic`, `guide_generic`
- **Entity extraction:** Commander (from COMMANDERS), card (from top_cards), archetype (from ARCHETYPES), strategy (from STRATEGIES)

### Generate API

- **Route:** `POST /api/admin/seo-pages/generate`
- **Auth:** Admin required
- **Logic:** `lib/seo/generate-pages.ts` — `generateSeoPages(admin, limit)`
- **Flow:**
  1. Load `seo_queries` ordered by impressions DESC
  2. For each query: classify → skip if canonical exists (resolver) → compute quality_score → skip if score < 1 → build slug → insert draft
  3. Resolver: skip candidates when canonical page exists (e.g. commander mulligan → `/commanders/{slug}/mulligan-guide`)
  4. Blocklist: `reddit`, `decklist`, `proxy`, `download`, `tier list`, `tier list site`
- **Params:** `?limit=500` (default)

### /q/[slug] Page

- **File:** `frontend/app/q/[slug]/page.tsx`
- **Route:** `/q/[slug]` — dynamic, one page per `seo_pages` row
- **Templates:** Rendered via `CommanderMulliganLanding`, `CommanderBudgetLanding`, `CommanderCostLanding`, `CommanderBestCardsLanding`, `CardPriceLanding`, `CardDecksLanding`, `ArchetypeLanding`, `StrategyLanding`, `ToolGenericLanding`, `GuideGenericLanding`
- **Metadata:** `robots: { index: false }` when `indexing === 'noindex'`
- **Redirect:** If `resolved_url` set, 308 permanent redirect to canonical
- **Internal links:** `InternalLinkBlocks` — 6 Popular Commanders + 6 Top Cards

### Landing Components

- **Directory:** `frontend/components/seo-landing/`
- **Files:** `CommanderMulliganLanding.tsx`, `CommanderBudgetLanding.tsx`, `CommanderCostLanding.tsx`, `CommanderBestCardsLanding.tsx`, `CardPriceLanding.tsx`, `CardDecksLanding.tsx`, `ArchetypeLanding.tsx`, `StrategyLanding.tsx`, `ToolGenericLanding.tsx`, `GuideGenericLanding.tsx`, `CTAPanel.tsx`, `ExploreLinks.tsx`, `InternalLinkBlocks.tsx`, `SeoLandingAnalytics.tsx`

---

## 7. Phase 9.5: Discovery Engine Hardening

### Resolver (Prevent Duplicates)

- **Logic:** In `generateSeoPages`, skip candidate if canonical URL exists
- **Canonical mapping:**
  - `commander_mulligan`, `commander_budget`, `commander_best_cards` → `/commanders/{slug}/mulligan-guide` etc. (if slug in first 50)
  - `commander_cost` → no canonical; keep `/q/*`
  - `archetype` → `/commander-archetypes/{slug}` (if in ARCHETYPES)
  - `strategy` → `/strategies/{slug}` (if in STRATEGIES)
  - `card_price`, `card_decks` → `/cards/{slug}` (if in top_cards)

### Quality Score

- **Computed in:** `generateSeoPages` → `computeQualityScore()`
- **Rules:** +2 commander, +2 card, +1 archetype/strategy, +1 high confidence; -2 short query (<4 chars), -2 blocklist
- ** threshold:** Skip if score < 1
- **Store:** `quality_score` column on `seo_pages`

### Indexing Control

- **Default:** `indexing = 'noindex'` for all new drafts and published
- **Sitemap:** Only includes pages where `status = 'published' AND indexing = 'index'`
- **Metadata:** `robots: { index: false }` when `indexing === 'noindex'`
- **Toggle:** Admin can set `index` for individual pages when confident

### Redirect (resolved_url)

- **Column:** `resolved_url` — when set, `/q/[slug]` returns 308 permanent redirect to canonical
- **Use:** Backfill or future resolver changes; currently we skip at generate time

### Publish API

- **Route:** `POST /api/admin/seo-pages/publish`
- **Params:** `?limit=25&minQuality=1&minPriority=0`
- **Filter:** `status = 'draft' AND quality_score >= minQuality`
- **Action:** Set `status = 'published'`, `updated_at`

### Set-Indexing API

- **Route:** `POST /api/admin/seo-pages/set-indexing`
- **Body:** `{ slug, indexing: 'index' | 'noindex' }`
- **Auth:** Admin required

### List API

- **Route:** `GET /api/admin/seo-pages/list`
- **Params:** `?status=draft|published|disabled`, `?join=metrics`, `?sort=priority_desc|impressions_desc|impressions_asc`, `?limit=200`
- **When join=metrics:** Joins `seo_queries` on `query` to include `impressions`, `clicks`

### Admin UI

- **Route:** `/admin/seo/pages`
- **Features:**
  - Generate from queries
  - Publish top 25 / Publish all qualifying
  - Status filter, sort by impressions (high/low), priority
  - Include metrics (impressions, clicks)
  - Quality column
  - Indexing toggle (for published pages)
  - Per-row actions: Publish, Disable, Restore

### Scripts

- **seed-seo-queries.ts:** Seeds sample `commander_cost` queries for testing (no GSC needed)
- **publish-seo-pages.ts:** Runs generate + publish in one shot (direct Supabase)
  - `npx tsx scripts/publish-seo-pages.ts [limit]`
  - Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

---

## 8. Files Touched (Full Reference)

| Category | Files |
|----------|-------|
| **Commander hub** | `app/commanders/[slug]/page.tsx`, `lib/commander-aggregates.ts` |
| **Commander content** | `app/commanders/[slug]/mulligan-guide/page.tsx`, `budget-upgrades/page.tsx`, `best-cards/page.tsx` |
| **Commander index** | `app/commanders/page.tsx` |
| **Tools index** | `app/tools/page.tsx` |
| **Tool layouts** | `app/tools/mulligan/layout.tsx`, `app/tools/probability/layout.tsx`, `app/price-tracker/layout.tsx` |
| **Tool pages** | `app/collections/cost-to-finish/page.tsx`, `app/deck/swap-suggestions/page.tsx` |
| **Archetypes** | `app/commander-archetypes/page.tsx`, `[slug]/page.tsx` |
| **Strategies** | `app/strategies/page.tsx`, `[slug]/page.tsx` |
| **Cards** | `app/cards/page.tsx`, `[slug]/page.tsx` |
| **Meta** | `app/meta/page.tsx`, `[slug]/page.tsx` |
| **SEO landing** | `app/q/[slug]/page.tsx`, `components/seo-landing/*.tsx` |
| **Components** | `Header.tsx`, `ToolStrip.tsx`, `CommanderArtBanner.tsx`, `CommanderLinkWithHover.tsx`, `PopularCommanders.tsx` |
| **Lib** | `lib/commanders.ts`, `lib/seo/commander-content.ts`, `lib/seo/queryClassifier.ts`, `lib/seo/generate-pages.ts`, `lib/seo-pages.ts`, `lib/top-cards.ts`, `lib/server/scryfallCache.ts` |
| **API** | `app/api/commander-art/route.ts`, `app/api/cron/commander-aggregates/route.ts`, `app/api/admin/seo-queries/ingest/route.ts`, `app/api/admin/seo-pages/generate/route.ts`, `app/api/admin/seo-pages/publish/route.ts`, `app/api/admin/seo-pages/list/route.ts`, `app/api/admin/seo-pages/set-indexing/route.ts`, `app/api/admin/seo-pages/toggle/route.ts` |
| **Admin** | `app/admin/seo/pages/page.tsx` |
| **Scripts** | `scripts/ingest-gsc-queries.ts`, `scripts/seed-seo-queries.ts`, `scripts/publish-seo-pages.ts` |
| **Config** | `app/sitemap.ts`, `vercel.json` |
| **Migrations** | `042_commander_aggregates.sql`, `044_meta_signals.sql`, `045_top_cards.sql`, `047_seo_queries.sql`, `048_seo_pages.sql`, `049_seo_pages_resolver_quality.sql` |

---

## 9. Constraints (Non-Negotiable)

- **SSR wherever possible** — no client-only content for SEO-critical pages
- **Plain `<a>` links** — not client routing only, for crawlability
- **No extra API calls** — commander data from `commanders.ts`; art from cache
- **No AI usage** — all content template-based
- **Cost protection** — CTAs prioritize low-cost tools (browse, mulligan, cost-to-finish) over AI chat

---

## 10. Extending Discovery

- **New commanders:** Add to `lib/data/commander_profiles.json` or the `extra` array in `lib/commanders.ts`; ensure slug uniqueness
- **New tool page:** Add to `/tools` index, add `PopularCommanders` section, add to sitemap, add ToolStrip if applicable
- **New commander field:** Extend `CommanderProfile` in `lib/commanders.ts` and `deriveCommanderSnapshot` in `lib/seo/commander-content.ts`
- **New archetype/strategy:** Add to `lib/data/archetypes.ts` or `lib/data/strategies.ts`; add to sitemap
- **New template type:** Extend `queryClassifier.ts`, add landing component, wire in `app/q/[slug]/page.tsx` and `generateSeoPages`
