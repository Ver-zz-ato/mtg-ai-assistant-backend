# ManaTap Discovery & Traffic Growth Audit

**Date:** February 11, 2026  
**Goal:** Audit product-level discoverability infrastructure to identify gaps preventing organic traffic growth  
**Context:** ~80 new visits/day; aiming to scale via search indexing, tool landing pages, deck-generated content, and SEO-structured internal linking

---

## 1. Discovery Readiness Score

| Category | Score | Notes |
|----------|-------|------|
| **Indexability** | 7/10 | Public deck pages are strong; some tool pages lack metadata |
| **Content Surface Area** | 5/10 | Decks + blog; no commander/archetype or deck-analysis landing pages |
| **Tool Landing SEO** | 5/10 | Cost-to-finish + mtg-commander strong; tools/mulligan, tools/probability weak |
| **Internal Linking** | 6/10 | Homepage + Header link to tools; TrustFooter lacks tool links |
| **Sitemap Coverage** | 6/10 | Decks + blog included; cost-to-finish and decks/browse missing |

---

## 2. Step 1 — Deck Page Indexability Audit

| Criterion | Status | File | Notes |
|-----------|--------|------|-------|
| **Public deck pages crawlable** | YES | `app/decks/[id]/page.tsx` | Server-rendered; public decks visible via RLS |
| **`<title>` dynamic (commander/deck name)** | YES | `app/decks/[id]/page.tsx` L59–126 | `generateMetadata` returns `{title} - {commander} \| ManaTap.ai` |
| **`<meta description>` from deck data** | YES | Same | Commander + format description |
| **H1 heading with deck name** | YES | L376 | `<h1>{title}</h1>` |
| **`noindex` on deck pages** | NO | — | `app/decks/[id]/layout.tsx` does NOT apply NOINDEX | 
| **Meaningful textual content** | YES | Full decklist, card names, stats, comments | Server-rendered HTML |
| **Canonical URLs** | YES | L87–88 | `alternates: { canonical: ... }` |
| **Sitemap includes decks** | YES | `app/sitemap.ts` L55–72 | Up to 500 public decks; `is_public=true` |

**Deck page file:** `frontend/app/decks/[id]/page.tsx`  
**Layout:** `frontend/app/decks/[id]/layout.tsx` (redirects owners to `/my-decks/[id]`)

**Note:** `my-decks` and `admin` use `NOINDEX` (`app/my-decks/layout.tsx`, `app/admin/layout.tsx` via `lib/noindex.ts`). Public decks at `/decks/[id]` are indexable.

---

## 3. Step 2 — Tool Landing Page SEO Audit

| Tool | Route | SEO-ready | Title | Meta | Static H1/H2 | Sitemap | Required Changes |
|------|-------|-----------|-------|------|--------------|---------|------------------|
| **Mulligan Simulator** | `/tools/mulligan` | NO | Inherits root | Inherits root | Client-only | YES | Add layout.tsx with metadata, H1, static intro |
| **Probability Calculator** | `/tools/probability` | NO | Inherits root | Inherits root | Client-only | YES | Add layout.tsx with metadata, H1, static intro |
| **Cost to Finish** | `/collections/cost-to-finish` | YES | YES | YES | Client component | **NO** | Add to sitemap |
| **Budget Swaps** | `/budget-swaps` → `/deck/swap-suggestions` | PARTIAL | Swap page has metadata | Swap page | Swap page | YES (redirects) | Add metadata to swap-suggestions; fix redirect chain |
| **Deck Swap Suggestions** | `/deck/swap-suggestions` | PARTIAL | YES | YES | — | NO | Add to sitemap; add landing intro |
| **Price Tracker** | `/price-tracker` | NO | Inherits root | Inherits root | Client-only | YES | Add layout.tsx with metadata, H1 |
| **Commander Deck Builder** | `/mtg-commander-ai-deck-builder` | YES | YES | YES | YES | YES | — |

**Keyword-targeted landing pages:** Only `mtg-commander-ai-deck-builder` targets "Commander deck builder", "MTG deck analyzer". No `"Commander Mulligan Calculator"`-style pages.

**Files:**
- Mulligan: `frontend/app/tools/mulligan/page.tsx` (client-only)
- Probability: `frontend/app/tools/probability/page.tsx` (client-only)
- Cost-to-finish: `frontend/app/collections/cost-to-finish/page.tsx` (has metadata)
- Budget-swaps: `frontend/app/budget-swaps/page.tsx` (redirects); `frontend/app/deck/swap-suggestions/page.tsx` (has metadata)
- Price-tracker: `frontend/app/price-tracker/page.tsx` (client-only)
- mtg-commander: `frontend/app/mtg-commander-ai-deck-builder/page.tsx` (full SEO)

---

## 4. Step 3 — Content Generation Surfaces

| Surface | Exists | Indexable | Crawlable | Est. Count |
|---------|--------|-----------|-----------|------------|
| **Public deck pages** | YES | YES | YES | ~500+ (sitemap limit) |
| **Blog posts** | YES | YES | YES | ~10 |
| **Public deck analysis pages** | NO | — | — | 0 |
| **Public deck upgrade recommendations** | NO | — | — | 0 |
| **Archetype / commander landing pages** | NO | — | — | 0 |
| **Card comparison pages** | NO | — | — | 0 |
| **Browse decks** | YES | YES | YES | 1 |

**Deck analysis:** Embedded in `DeckAnalyzerExpandable` (homepage RightSidebar) and `DeckAnalyzerPanel` (deck page). Requires auth for deck page; no public deck analysis URLs.

**Estimated indexable pages:** ~510 (decks + blog + static pages). No long-tail content from deck analysis or commander archetypes.

---

## 5. Step 4 — Internal Linking Structure

| Link Type | From | To | Status |
|-----------|------|----|--------|
| **Tools from homepage** | TopToolsStrip | Cost-to-finish, budget-swaps, price-tracker, mulligan, probability | YES |
| **Browse decks** | Header | `/decks/browse` | YES |
| **Commander landing** | Header | `/mtg-commander-ai-deck-builder` | YES |
| **Collections** | Header | `/collections` | YES |
| **Decks from deck pages** | — | None | — |
| **Tools from deck pages** | DeckAssistant | Cost-to-finish, probability | Link only |
| **TrustFooter** | — | Pricing, social, legal | NO tool links |
| **Footer links to tools** | — | — | NO |

**Missing:**
- Deck browse page → individual deck pages (decks are linked from browse)
- Browse decks in sitemap
- TrustFooter / footer links to tools (mulligan, probability, cost-to-finish)
- Commander / archetype hub pages linking to decks

**Overall:** Moderate. Header and TopToolsStrip provide good coverage; footer lacks tool links.

---

## 6. Step 5 — Sitemap & Robots Configuration

| Item | Status | Details |
|------|--------|---------|
| **sitemap exists** | YES | `frontend/app/sitemap.ts` |
| **URL** | — | https://www.manatap.ai/sitemap.xml |
| **decks included** | YES | Up to 500 public decks |
| **tools included** | PARTIAL | `tools/mulligan`, `tools/probability` | 
| **cost-to-finish included** | **NO** | Missing |
| **decks/browse included** | **NO** | Missing |
| **deck/swap-suggestions included** | **NO** | Missing |
| **robots.txt** | YES | `frontend/public/robots.txt` |
| **robots.txt content** | Allow /, Disallow /admin/, /api/; Sitemap URL | — |

**Sitemap file:** `frontend/app/sitemap.ts`  
**robots.txt:** `frontend/public/robots.txt`

---

## 7. Step 6 — Analytics Discovery Tracking

| Item | Status | Implementation |
|------|--------|-----------------|
| **Referral sources tracked** | YES | `referrer` in `user_first_visit`, `pageview_server` |
| **Landing pages tracked** | YES | `landing_page` in middleware |
| **UTM params tracked** | YES | `utm_source`, `utm_medium`, `utm_campaign` |
| **Organic search identifiable** | PARTIAL | `referrer` includes google.com; no explicit `$referring_domain` or `organic` flag |
| **Session context** | YES | `session-bootstrap.ts`; `getSessionContext()` |

**Files:** `frontend/middleware.ts`, `frontend/lib/analytics/session-bootstrap.ts`, `frontend/lib/ph.ts`

**PostHog:** `pageview_server`, `user_first_visit` include `referrer`, `landing_page`, `path`, UTM. `$pageview` (client) is standard. To isolate organic search, filter by `referrer` containing `google` or use PostHog’s built-in traffic source attribution.

**Tracking readiness for SEO growth:** PARTIAL — core tracking in place; no dedicated `organic_search_landing` or source attribution event.

---

## 8. Current Discovery Strengths

1. **Public deck pages:** Strong `generateMetadata`, canonical, H1, server-rendered content, Open Graph, commander art.
2. **Commander landing page:** Full SEO (`mtg-commander-ai-deck-builder`), metadata, JSON-LD, schema.org.
3. **Cost-to-finish:** SEO metadata and canonical.
4. **Blog:** Multiple posts with metadata; included in sitemap.
5. **Sitemap:** Decks + blog + tools; robots.txt allows crawl.
6. **Analytics:** Referrer, landing page, UTM in first-visit and pageview.
7. **Homepage:** TopToolsStrip links to all tools; H1 "MTG AI Deck Builder"; JSON-LD.

---

## 9. Major Discovery Gaps

1. **Cost-to-finish not in sitemap** — High-value tool; no sitemap entry.
2. **Deck browse not in sitemap** — Entry point for deck discovery.
3. **Mulligan, probability, price-tracker lack metadata** — Client-only pages; no custom title, description, or H1.
4. **No keyword-targeted tool landing pages** — e.g. "Commander Mulligan Calculator", "MTG Cost to Finish Calculator".
5. **No long-tail content from deck data** — No commander hub pages, archetype pages, or public deck analysis URLs.
6. **No static H1/H2 on tool pages** — Client components render after JS; crawlers may miss structure.
7. ** organic search not explicitly segmented** — No `organic_search` or `utm_source=organic` style event.

---

## 10. Recommended Next 5 Implementation Steps (Highest ROI First)

### 1. Add missing routes to sitemap (high impact, low effort)

**File:** `frontend/app/sitemap.ts`

Add to `staticRoutes`:

- `"collections/cost-to-finish"`
- `"decks/browse"`
- `"deck/swap-suggestions"`

Remove or redirect `budget-swaps` if it redirects to `/deck/swap-suggestions`; otherwise keep or add swap-suggestions.

### 2. Add metadata + layout for tool pages (mulligan, probability, price-tracker)

**Files:** `frontend/app/tools/mulligan/layout.tsx`, `frontend/app/tools/probability/layout.tsx`, `frontend/app/price-tracker/layout.tsx`

- Create `layout.tsx` with `metadata` (title, description, Open Graph).
- Add canonical URLs.
- Add keyword-rich titles (e.g. "Commander Mulligan Simulator | ManaTap AI", "MTG Probability Calculator | ManaTap AI").
- Add static intro text in server-rendered wrapper (e.g. `page.tsx` with server wrapper + client component) so crawlers see H1 and explanatory text.

### 3. Add static intro + H1 to each tool page

**Files:** `frontend/app/tools/mulligan/page.tsx`, `frontend/app/tools/probability/page.tsx`, `frontend/app/collections/cost-to-finish/page.tsx`, `frontend/app/price-tracker/page.tsx`

- Wrap client components in server-rendered `<section>` with `<h1>` and 2–3 sentences (e.g. "Calculate how often you'll keep your opening hand with Commander mulligan rules.").
- Ensures crawlers see structure without relying on JS.

### 4. Add tool links to TrustFooter / footer

**File:** `frontend/components/TrustFooter.tsx`

- Add a "Tools" section: "Cost to Finish", "Mulligan Simulator", "Probability Calculator", "Budget Swaps", "Price Tracker".
- Improves internal linking and crawl depth.

### 5. Add organic search attribution event

**Files:** `frontend/middleware.ts`, `frontend/lib/analytics/events.ts`

- Add `organic_search_landing` or extend `user_first_visit` with `traffic_source: 'organic' | 'direct' | 'referral'` when `referrer` includes `google`/`bing`/`duckduckgo`.
- Enables filtering PostHog dashboards by organic traffic.

---

## Appendix: File Reference

| Area | File(s) |
|------|---------|
| Deck metadata | `frontend/app/decks/[id]/page.tsx` |
| noindex | `frontend/lib/noindex.ts`, `frontend/app/my-decks/layout.tsx`, `frontend/app/admin/layout.tsx` |
| Sitemap | `frontend/app/sitemap.ts` |
| robots.txt | `frontend/public/robots.txt` |
| Tool pages | `frontend/app/tools/mulligan/page.tsx`, `frontend/app/tools/probability/page.tsx`, `frontend/app/collections/cost-to-finish/page.tsx`, `frontend/app/price-tracker/page.tsx`, `frontend/app/deck/swap-suggestions/page.tsx` |
| Commander landing | `frontend/app/mtg-commander-ai-deck-builder/page.tsx` |
| Internal links | `frontend/components/TopToolsStrip.tsx`, `frontend/components/Header.tsx`, `frontend/components/TrustFooter.tsx` |
| Analytics | `frontend/middleware.ts`, `frontend/lib/analytics/session-bootstrap.ts`, `frontend/lib/ph.ts`
