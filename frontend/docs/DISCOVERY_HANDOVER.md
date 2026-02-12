# Discovery Flywheel + Commander Workspace — Implementation Handover

Summary of all discovery-related work for LLM context. Use this when extending, debugging, or changing discovery flows.

---

## 1. Commander Workspace Upgrade

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
- **Segments:**
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

## 4. Commander Art (Images from Cache)

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

## 5. Files Touched (Quick Reference)

| Category | Files |
|----------|-------|
| **Commander hub** | `app/commanders/[slug]/page.tsx`, `lib/commander-aggregates.ts` |
| **Commander content** | `app/commanders/[slug]/mulligan-guide/page.tsx`, `budget-upgrades/page.tsx`, `best-cards/page.tsx` |
| **Commander index** | `app/commanders/page.tsx` |
| **Tools index** | `app/tools/page.tsx` |
| **Tool layouts** | `app/tools/mulligan/layout.tsx`, `app/tools/probability/layout.tsx`, `app/price-tracker/layout.tsx` |
| **Tool pages** | `app/collections/cost-to-finish/page.tsx`, `app/deck/swap-suggestions/page.tsx` |
| **Components** | `Header.tsx`, `ToolStrip.tsx`, `CommanderArtBanner.tsx`, `CommanderLinkWithHover.tsx`, `PopularCommanders.tsx` |
| **Lib** | `lib/commanders.ts`, `lib/seo/commander-content.ts`, `lib/server/scryfallCache.ts` |
| **API** | `app/api/commander-art/route.ts`, `app/api/cron/commander-aggregates/route.ts` |
| **Config** | `app/sitemap.ts`, `vercel.json`, `db/migrations/042_commander_aggregates.sql` |

---

## 6. Constraints (Non-Negotiable)

- **SSR wherever possible** — no client-only content for SEO-critical pages
- **Plain `<a>` links** — not client routing only, for crawlability
- **No extra API calls** — commander data from `commanders.ts`; art from cache
- **No AI usage** — all content template-based
- **Cost protection** — CTAs prioritize low-cost tools (browse, mulligan, cost-to-finish) over AI chat

---

## 7. Extending Discovery

- **New commanders:** Add to `lib/data/commander_profiles.json` or the `extra` array in `lib/commanders.ts`; ensure slug uniqueness
- **New tool page:** Add to `/tools` index, add `PopularCommanders` section, add to sitemap, add ToolStrip if applicable
- **New commander field:** Extend `CommanderProfile` in `lib/commanders.ts` and `deriveCommanderSnapshot` in `lib/seo/commander-content.ts`
