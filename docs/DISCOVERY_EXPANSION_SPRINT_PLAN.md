# Discovery Expansion Sprint Plan

**Date:** February 11, 2026  
**Goal:** Expand indexable surface area and fix Google indexing blockers  
**Context:** ~226 clicks / 28 days, ~1.5k impressions; mostly branded queries. 17 pages crawled but not indexed.

---

## Step 1 — SEO Plumbing

| Component | Location | Status |
|-----------|-----------|--------|
| **Sitemap** | `frontend/app/sitemap.ts` | ✅ Exists; returns `MetadataRoute.Sitemap` |
| **robots.txt** | `frontend/public/robots.txt` | ✅ Exists; references `https://www.manatap.ai/sitemap.xml` |
| **Metadata / canonical** | Next.js `metadata` exports, `alternates.canonical` | Mixed: some pages use full URL, some relative |
| **metadataBase** | `frontend/app/layout.tsx` L33 | `https://www.manatap.ai` |

### Sitemap routes included

- Homepage, my-decks, collections, profile, wishlist, pricing, privacy, terms, support, changelog
- budget-swaps, price-tracker, tools/probability, tools/mulligan
- blog index + 9 blog slugs
- mtg-commander-ai-deck-builder
- Public decks (up to 500, `is_public=true`)

### robots.txt

```
User-agent: *
Disallow: /admin/
Disallow: /api/
Allow: /
Sitemap: https://www.manatap.ai/sitemap.xml
```

### Canonical usage

- **Full URL:** `app/decks/[id]/page.tsx`, `app/collections/cost-to-finish/page.tsx`, `app/thank-you/page.tsx`, `app/wishlist/[id]/page.tsx`
- **Relative:** `app/layout.tsx` (`/`), `app/mtg-commander-ai-deck-builder/page.tsx`, `app/compare-decks/page.tsx`, blog pages
- Next.js resolves relative canonicals via `metadataBase` → full URL

---

## Step 2 — Tool Page SEO Readiness Audit

| Route | Title set? | Meta desc? | H1? | Static text? | Canonical? | Likely indexable? | Fix |
|-------|------------|------------|-----|--------------|------------|-------------------|-----|
| `/tools/mulligan` | ❌ | ❌ | ❌ | ❌ | ❌ | **NO** | Add layout with metadata; add server wrapper with H1 + ~200 words static copy |
| `/tools/probability` | ❌ | ❌ | ❌ | ❌ | ❌ | **NO** | Same |
| `/price-tracker` | ❌ | ❌ | ❌ | ❌ | ❌ | **NO** | Same |
| `/budget-swaps` | ❌ | ❌ | ❌ | ❌ | ❌ | **NO** | **Redirect only** — replace with server 301 to `/deck/swap-suggestions`; remove from sitemap |
| `/deck/swap-suggestions` | ✅ | ✅ | ✅ (client) | ❌ | ❌ | **PARTIAL** | Add canonical; add server-rendered intro (~150 words) above Client |
| `/collections/cost-to-finish` | ✅ | ✅ | ❌ | ❌ | ✅ | **PARTIAL** | Add H1 + static intro (~150 words) in server wrapper |
| `/pricing` | ❌ | ❌ | ❌ | ❌ | ❌ | **PARTIAL** | Add layout with metadata; pricing can stay noindex if desired, but should have title |
| Deck analysis | N/A | — | — | — | — | — | No standalone landing page; embedded in RightSidebar |

### Notes

- **budget-swaps:** Client-only page that calls `router.replace('/deck/swap-suggestions')` on mount. Renders nothing before redirect. Sitemap includes it → Google receives a redirecting URL with no content.
- **deck/swap-suggestions:** Has metadata and H1 inside Client (client-rendered). Crawlers may not see H1/intro until JS runs.
- **cost-to-finish:** Has metadata + canonical. Content is client-rendered; no static H1 or intro.
- **mulligan, probability, price-tracker:** Fully client-only; no metadata, no static text.

---

## Step 3 — Public Deck Page Indexability Audit

| Criterion | Status | File |
|-----------|--------|------|
| **Publicly accessible** | ✅ | `app/decks/[id]/page.tsx` — RLS allows public decks |
| **Metadata (title/desc)** | ✅ | `generateMetadata` with deck title, commander, format |
| **Canonical** | ✅ | `https://www.manatap.ai/decks/${id}` |
| **Meaningful SSR text** | ✅ | Decklist, stats, card names, H1 — server-rendered |
| **Internal links** | ✅ | Browse page links to decks; deck pages link to browse via Header |
| **In sitemap** | ✅ | Up to 500 public decks |

**Deck route:** `frontend/app/decks/[id]/page.tsx`  
**Browse page:** `frontend/app/decks/browse/page.tsx` — **not in sitemap**

**Findings:** Deck pages are indexable. Browse page is a strong hub but missing from sitemap.

---

## Step 4 — Redirect / Canonical Duplication Causes

### Top causes of "Page with redirect" and canonical issues

1. **budget-swaps client redirect**
   - **Cause:** `app/budget-swaps/page.tsx` does `router.replace('/deck/swap-suggestions')` on mount. Renders empty HTML, then client-side redirect.
   - **Impact:** Google sees a page that immediately redirects; no indexable content. Sitemap submits this URL.
   - **Fix:** Add server-side 301 redirect in `next.config.ts` from `/budget-swaps` → `/deck/swap-suggestions`. Remove `budget-swaps` from sitemap. Add `deck/swap-suggestions` to sitemap.

2. **Canonical format inconsistency**
   - **Cause:** Some pages use full URL (`https://www.manatap.ai/...`), others relative (`/blog/...`). Next.js resolves relative via metadataBase, but consistency helps.
   - **Fix:** Standardize on full URLs for `alternates.canonical` where possible, or ensure all use `metadataBase`-relative paths consistently.

3. **www redirect**
   - **Status:** Middleware redirects `manatap.ai` → `www.manatap.ai` (308). Single hop. Sitemap uses `https://www.manatap.ai`. ✅ Correct.

4. **"Alternative page with proper canonical"**
   - **Likely cause:** Duplicate content (e.g. with/without trailing slash, or http vs https). `skipTrailingSlashRedirect: true` in next.config — no trailing slash redirect. Canonical should point to `https://www.manatap.ai/...` everywhere.

### Recommended fixes

- **next.config.ts:** Add `redirects` for `/budget-swaps` → `/deck/swap-suggestions` (301).
- **sitemap.ts:** Remove `budget-swaps`; add `deck/swap-suggestions`, `collections/cost-to-finish`, `decks/browse`.
- **Canonical:** Ensure all indexable pages use `alternates: { canonical: "https://www.manatap.ai/..." }` (full URL).

---

## Step 5 — Sitemap Coverage Expansion Plan

### Current coverage

| Category | Included | Missing |
|----------|----------|---------|
| Homepage | ✅ | — |
| Tool pages | budget-swaps*, mulligan, probability, price-tracker | cost-to-finish, deck/swap-suggestions |
| Browse | ❌ | decks/browse |
| Commander landing | ✅ | — |
| Decks | ✅ (500) | — |
| Blog | ✅ | — |
| Pricing/legal | ✅ | — |

\* budget-swaps redirects; should be removed.

### Recommended sitemap strategy

1. **Remove:** `budget-swaps` (replaced by server redirect).
2. **Add:** `collections/cost-to-finish`, `decks/browse`, `deck/swap-suggestions`.
3. **Decks:** Keep current strategy (500 public decks, `updated_at` desc). If needed later: filter by `updated_at >= now - 30 days` or top by likes.
4. **Host:** All URLs use `https://www.manatap.ai` (already correct).

### Implementation

**File:** `frontend/app/sitemap.ts`

```ts
// In staticRoutes array, REPLACE:
// "budget-swaps" 
// WITH:
"collections/cost-to-finish",
"decks/browse",
"deck/swap-suggestions",
```

Remove `"budget-swaps"` from the array.

---

## Step 6 — Internal Linking Upgrades

| Upgrade | Placement | Links to | Effort |
|---------|------------|----------|--------|
| **1. Tools section on homepage** | Below H1 block, above grid | Cost to Finish, Mulligan, Probability, Budget Swaps, Price Tracker (text links) | S |
| **2. Related tools on deck pages** | Public deck page (`app/decks/[id]/page.tsx`), below decklist | "Try: Cost to Finish · Mulligan · Budget Swaps" | S |
| **3. Try with this deck on tools** | Cost-to-finish, mulligan, probability | "Load from deck" / `?deckId=X` when on deck page | M (already partially exists) |
| **4. TrustFooter tool links** | `frontend/components/TrustFooter.tsx` | Add "Tools" row: Cost to Finish, Mulligan, Probability, Budget Swaps, Price Tracker | S |
| **5. Browse decks link from tools** | Tool intro sections | "Explore community decks →" link to `/decks/browse` | S |

---

## Step 7 — Deliverable

### A) Discovery Readiness Score (0–5)

| Area | Score | Notes |
|------|-------|-------|
| **Tool pages SEO readiness** | 1/5 | Mulligan, probability, price-tracker lack metadata and static copy; cost-to-finish and swap-suggestions partial |
| **Deck pages indexability** | 4/5 | Strong metadata, canonical, SSR; browse missing from sitemap |
| **Sitemap coverage** | 3/5 | Missing cost-to-finish, decks/browse, deck/swap-suggestions; budget-swaps is redirect |
| **Canonical/redirect hygiene** | 2/5 | budget-swaps client redirect; canonical format mixed |
| **Internal linking strength** | 3/5 | Header + TopToolsStrip good; footer lacks tools; deck pages lack tool links |

**Overall:** 2.6/5

---

### B) Top 10 Fixes (Prioritized)

| # | Fix | Why | File(s) | Effort |
|---|-----|-----|---------|--------|
| 1 | Add layout with metadata + H1 + static intro for mulligan | Unlocks "Commander mulligan calculator" intent | `app/tools/mulligan/layout.tsx`, wrap page with server intro | M |
| 2 | Add layout with metadata + H1 + static intro for probability | Unlocks "MTG probability calculator" intent | `app/tools/probability/layout.tsx`, wrap page | M |
| 3 | Add layout with metadata + H1 + static intro for price-tracker | Unlocks "MTG price tracker" intent | `app/price-tracker/layout.tsx` | M |
| 4 | Replace budget-swaps client redirect with server 301 | Eliminates "page with redirect" in GSC; cleaner crawl | `next.config.ts` (redirects) | S |
| 5 | Fix sitemap: add cost-to-finish, decks/browse, deck/swap-suggestions; remove budget-swaps | Ensures valuable pages are discoverable | `app/sitemap.ts` | S |
| 6 | Add canonical + server intro to deck/swap-suggestions | Strengthens swap-suggestions as canonical budget tool page | `app/deck/swap-suggestions/page.tsx` | S |
| 7 | Add H1 + static intro to cost-to-finish | Cost-to-finish has metadata but no static text; improves indexability | `app/collections/cost-to-finish/page.tsx` | S |
| 8 | Add "Related tools" block to public deck pages | Internal linking from decks → tools | `app/decks/[id]/page.tsx` | S |
| 9 | Add Tools section to TrustFooter | Footer links help crawlers find tool pages | `components/TrustFooter.tsx` | S |
| 10 | Add Tools text links to homepage (below H1) | Homepage is highest authority; text links aid crawl | `app/page.tsx` | S |

---

### C) First 48 Hours Patch List (Smallest High-Impact Changes)

Aim: Changes that improve indexing quickly with minimal risk.

| # | Change | File | Effort |
|---|--------|------|--------|
| 1 | **Add server 301 redirect** for budget-swaps → deck/swap-suggestions | `next.config.ts` | S |
| 2 | **Update sitemap:** add `collections/cost-to-finish`, `decks/browse`, `deck/swap-suggestions`; remove `budget-swaps` | `app/sitemap.ts` | S |
| 3 | **Add layout with metadata** for tools/mulligan (title, description, canonical) | `app/tools/mulligan/layout.tsx` | S |
| 4 | **Add layout with metadata** for tools/probability | `app/tools/probability/layout.tsx` | S |
| 5 | **Add layout with metadata** for price-tracker | `app/price-tracker/layout.tsx` | S |
| 6 | **Add canonical** to deck/swap-suggestions | `app/deck/swap-suggestions/page.tsx` | S |
| 7 | **Add static H1 + ~150 words** to cost-to-finish page (server-rendered above Client) | `app/collections/cost-to-finish/page.tsx` | S |
| 8 | **Add static H1 + ~150 words** to deck/swap-suggestions page (server-rendered above Client) | `app/deck/swap-suggestions/page.tsx` | S |
| 9 | **Add Tools links** to TrustFooter | `components/TrustFooter.tsx` | S |
| 10 | **Add "Related tools"** block to public deck page | `app/decks/[id]/page.tsx` | S |

---

## Patch Plan — Code Suggestions

### 1. next.config.ts — Add redirect

```ts
// Add alongside existing rewrites() in nextConfig:
async redirects() {
  return [
    { source: '/budget-swaps', destination: '/deck/swap-suggestions', permanent: true },
  ];
},
```

(Next.js supports both `redirects` and `rewrites` as separate config keys.)

### 2. app/sitemap.ts — Update static routes

```ts
// Replace "budget-swaps" with:
"collections/cost-to-finish",
"decks/browse",
"deck/swap-suggestions",
```

### 3. app/tools/mulligan/layout.tsx — New file

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Commander Mulligan Simulator | MTG Keep Rate Calculator | ManaTap AI",
  description: "Simulate Commander mulligans with London rules. Calculate keep rates for lands, ramp, and key cards. Free MTG mulligan calculator for EDH.",
  alternates: { canonical: "https://www.manatap.ai/tools/mulligan" },
};

export default function MulliganLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

### 4. app/tools/probability/layout.tsx — New file

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MTG Probability Calculator | Commander Draw Odds | ManaTap AI",
  description: "Calculate probability of drawing lands, ramp, or combo pieces in Magic: The Gathering. Free hypergeometric calculator for Commander and EDH.",
  alternates: { canonical: "https://www.manatap.ai/tools/probability" },
};

export default function ProbabilityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

### 5. app/price-tracker/layout.tsx — New file

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MTG Price Tracker | Card Price History | ManaTap AI",
  description: "Track Magic: The Gathering card prices over time. View price history, trends, and alerts for your deck and collection.",
  alternates: { canonical: "https://www.manatap.ai/price-tracker" },
};

export default function PriceTrackerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

### 6. app/deck/swap-suggestions/page.tsx — Add canonical + static intro

```tsx
// In metadata, add:
alternates: { canonical: "https://www.manatap.ai/deck/swap-suggestions" },

// In Page component, add above <Client />:
<section className="mb-6 prose prose-invert max-w-none">
  <h1 className="text-2xl font-bold mb-2">Budget Swaps</h1>
  <p className="text-neutral-300 text-sm md:text-base">
    Paste your decklist or select a deck to get cheaper alternatives for expensive cards.
    Quick Swaps uses a curated list of budget replacements; AI-Powered Swaps (Pro) analyzes
    your deck's strategy to find smarter alternatives. Reduce your deck cost without losing
    power or flavor.
  </p>
</section>
```

### 7. app/collections/cost-to-finish/page.tsx — Add static intro

```tsx
// In Page component, add above <Client />:
<section className="mb-6 prose prose-invert max-w-none">
  <h1 className="text-2xl font-bold mb-2">Cost to Finish</h1>
  <p className="text-neutral-300 text-sm md:text-base">
    Paste a decklist to estimate how much it costs to complete. Optionally subtract cards
    you already own from a selected collection. Get prices in USD, EUR, or GBP. See
    which cards drive the cost and get swap suggestions to stay within budget.
  </p>
</section>
```

### 8. components/TrustFooter.tsx — Add Tools links

Add a row or section:

```tsx
<div className="flex flex-wrap gap-4 text-sm">
  <span className="text-neutral-500">Tools:</span>
  <a href="/collections/cost-to-finish" className="hover:text-white">Cost to Finish</a>
  <a href="/tools/mulligan" className="hover:text-white">Mulligan Simulator</a>
  <a href="/tools/probability" className="hover:text-white">Probability Calculator</a>
  <a href="/deck/swap-suggestions" className="hover:text-white">Budget Swaps</a>
  <a href="/price-tracker" className="hover:text-white">Price Tracker</a>
</div>
```

### 9. app/decks/[id]/page.tsx — Add Related tools block

Add near the action buttons or below the decklist:

```tsx
<div className="mt-4 text-sm text-neutral-400">
  Try with this deck:{" "}
  <a href={`/collections/cost-to-finish?deck=${id}`} className="text-cyan-400 hover:underline">Cost to Finish</a>
  {" · "}
  <a href={`/tools/mulligan?deckId=${id}`} className="text-cyan-400 hover:underline">Mulligan Simulator</a>
  {" · "}
  <a href={`/deck/swap-suggestions?deckId=${id}`} className="text-cyan-400 hover:underline">Budget Swaps</a>
</div>
```

### 10. app/page.tsx — Add Tools text links (optional, below H1)

```tsx
<p className="text-sm text-neutral-400 mt-2">
  <a href="/collections/cost-to-finish" className="hover:text-white">Cost to Finish</a>
  {" · "}
  <a href="/tools/mulligan" className="hover:text-white">Mulligan Simulator</a>
  {" · "}
  <a href="/tools/probability" className="hover:text-white">Probability Calculator</a>
  {" · "}
  <a href="/deck/swap-suggestions" className="hover:text-white">Budget Swaps</a>
  {" · "}
  <a href="/price-tracker" className="hover:text-white">Price Tracker</a>
</p>
```

---

## Summary

- **Phase 1 (First 48h):** Redirect fix, sitemap update, tool layouts (metadata), canonical + static intro for cost-to-finish and swap-suggestions, footer + deck page links.
- **Phase 2:** Add static H1 + ~200 words to mulligan, probability, price-tracker (server wrapper or separate intro component).
- **Phase 3:** Keyword landing pages (Commander Mulligan Calculator, etc.) as separate routes or enhanced intros.

No blog content or marketing campaigns; focus is product-level SEO infrastructure only.
