# Sentry production investigation — 2026-06-09

Investigation of four unresolved `javascript-nextjs` issues. **No code fixes in this pass** — findings and recommended actions only.

Dashboards:

- [All website unresolved](https://manatapai.sentry.io/issues/?project=javascript-nextjs&query=is%3Aunresolved)
- [NEXTJS-32](https://manatapai.sentry.io/issues/JAVASCRIPT-NEXTJS-32) · [NEXTJS-2](https://manatapai.sentry.io/issues/JAVASCRIPT-NEXTJS-2) · [NEXTJS-2Y](https://manatapai.sentry.io/issues/JAVASCRIPT-NEXTJS-2Y) · [NEXTJS-2X](https://manatapai.sentry.io/issues/JAVASCRIPT-NEXTJS-2X)

---

## Summary

| Issue | Verdict | User impact | Action |
|-------|---------|-------------|--------|
| **NEXTJS-32** | **Confirmed** | Low (Safari throws; page renders) | Fix later — JSON-LD `@graph` |
| **NEXTJS-2** (+35) | **Confirmed** | **Yes** — mobile deck editor | **Fix now** — `DeckSidebar.tsx` |
| **NEXTJS-2Y** | **Confirmed** (two layers) | Perf/cost on `/` | Fix later — batch art + gate client Scryfall |
| **NEXTJS-2X** | **Likely bot noise** | No | Ignore / filter in Sentry |

Recommended fix order: **NEXTJS-2 → NEXTJS-32 → NEXTJS-2Y → NEXTJS-2X (optional filter only)**.

---

## 1. NEXTJS-32 — `/build-a-deck` JSON-LD (`@context.toLowerCase`)

### Root cause: **Confirmed**

Safari’s built-in JSON-LD parser throws when the page emits a **top-level JSON array** in `<script type="application/ld+json">`. The error `r["@context"].toLowerCase` is WebKit-internal — not application code.

### Evidence

- **Sentry (16 events, 7 users):** 100% **Safari on Mac**, `vercel-production`, stack `app:///build-a-deck` / `app:///mtg-deck-checker` at `global code` (inline script).
- **Cross-route:** Same error on `/mtg-deck-checker` (e.g. event `ea410410…`, 2026-06-07) — both pages use the array pattern.
- **Production HTML:** `https://www.manatap.ai/build-a-deck` JSON-LD body starts with `[` (verified via fetch).
- **Code:** [`app/build-a-deck/page.tsx`](../app/build-a-deck/page.tsx) — `JSON.stringify([WebApplication, FAQPage])`. Same in [`app/mtg-deck-checker/page.tsx`](../app/mtg-deck-checker/page.tsx). [`BuildADeckClient.tsx`](../app/build-a-deck/BuildADeckClient.tsx) has no JSON-LD.
- **Contrast:** [`app/mtg-ai-deck-builder/page.tsx`](../app/mtg-ai-deck-builder/page.tsx) and homepage [`app/page.tsx`](../app/page.tsx) use a single object — safer for Safari.

### User-visible impact

**No** — replays and reports suggest the page still renders; Sentry captures an uncaught Safari parser throw on load.

### Recommended action

**Fix later** — replace array with `@graph` wrapper or two separate JSON-LD scripts. Optional: `beforeSend` filter in [`instrumentation-client.ts`](../instrumentation-client.ts) if product accepts benign Safari noise.

### QA repro

1. Open `/build-a-deck` in Safari (macOS or iOS).
2. Console may show `undefined is not an object (evaluating 'r["@context"].toLowerCase')` on load.
3. View source — confirm JSON-LD starts with `[`.

---

## 2. NEXTJS-2 (+ NEXTJS-35) — `/my-decks/:id` hydration

### Root cause: **Confirmed**

`DeckCardRecommendationsWithHide` in [`app/my-decks/[id]/DeckSidebar.tsx`](../app/my-decks/[id]/DeckSidebar.tsx) uses viewport in `useState` initializer:

```tsx
useState(() => {
  if (typeof window === 'undefined') return true;   // SSR: render block
  return window.innerWidth >= 768;                  // mobile client: hide → null
});
```

Server renders recommendations; mobile client removes them → hydration mismatch.

The **live** deck page loads `DeckSidebar` via [`page.tsx`](../app/my-decks/[id]/page.tsx) (`require('./DeckSidebar')`). A **fixed** duplicate exists in [`Client.tsx`](../app/my-decks/[id]/Client.tsx) (`useState(true)` + `useEffect` viewport adjust) but is **not** used in the render tree for recommendations.

### Evidence

- **Sentry JAVASCRIPT-NEXTJS-2:** 105 events, 8 users, type `replay_hydration_error`. **All URLs** are `/my-decks/<uuid>` (14 unique decks). **Browsers:** Mobile Safari, Chrome Mobile, Samsung Internet, Edge Mobile — no desktop dominance.
- **Replays:** [d29398e687e74adcb2a46182e33047a3](https://manatapai.sentry.io/explore/replays/d29398e687e74adcb2a46182e33047a3) (latest iPhone event).
- **NEXTJS-35** (`removeChild` on same route): 1 event, likely downstream React reconciliation after failed hydrate. Replay: [d2af1a64ce6c4ff1b0882bdfe9d01f93](https://manatapai.sentry.io/explore/replays/d2af1a64ce6c4ff1b0882bdfe9d01f93).

### User-visible impact

**Yes** — hydration recovery on mobile deck editor; possible layout flicker or sidebar content mismatch.

### Recommended action

**Fix now** — copy the `Client.tsx` pattern into `DeckSidebar.tsx`. Add Playwright mobile viewport test on deck detail (no hydration console errors).

### QA repro

1. Production build: `npm run build && npm run start` in `frontend/`.
2. DevTools mobile viewport (<768px) → `/my-decks/<id>`.
3. Hard refresh; expect “Hydration failed” / React #418.
4. Isolation: remove `<DeckCardRecommendationsWithHide />` from `DeckSidebar` → warning should disappear.

---

## 3. NEXTJS-2Y — Homepage Scryfall N+1 on `/`

### Root cause: **Confirmed** (two contributing layers)

#### Layer A — Client-side direct Scryfall (what Sentry N+1 flags)

Sentry tags **`http.client`** spans on **browser pageload** to `https://api.scryfall.com/cards/named?fuzzy=*` (issue still active; last seen 2026-06-09).

Trace [3cda2d5b0a48b7a92e112831c1e623cb](https://manatapai.sentry.io/explore/traces/?query=trace%3A3cda2d5b0a48b7a92e112831c1e623cb) shows multiple browser `GET …/cards/named` and `POST …/cards/collection` during `/` pageload — **not** server-side API routes.

**Likely path:** [`components/Chat.tsx`](../components/Chat.tsx) restores guest messages from `localStorage` → `getImagesForNames()` in [`lib/scryfall-cache.ts`](../lib/scryfall-cache.ts) → on batch miss, **browser fallback** to [`lib/scryfall.ts`](../lib/scryfall.ts) (`cards/named?fuzzy=` per unresolved name, up to 20 parallel per batch).

#### Layer B — Homepage commander-art fan-out (architectural inefficiency)

On every `/` load:

- [`TrendingCommandersStrip.tsx`](../components/TrendingCommandersStrip.tsx) — up to **12** parallel `GET /api/commander-art?name=…`
- [`PopularCommanderGuides.tsx`](../components/PopularCommanderGuides.tsx) — **8** parallel same calls

**Total ~20 round-trips** per homepage visit. Batching exists at `POST /api/cards/batch-images` (used by [`collections/page.tsx`](../app/collections/page.tsx)) but **not** by these strips.

**Cache warmth:** All 8 `POPULAR_COMMANDERS` names are present in `scryfall_cache` (read-only Supabase query 2026-06-09). Trending names may still miss cache and trigger server-side fuzzy via [`app/api/commander-art/route.ts`](../app/api/commander-art/route.ts) → `getImagesForNamesCached`.

Homepage is `force-dynamic` ([`app/page.tsx`](../app/page.tsx)); [`RecentPublicDecks.tsx`](../components/RecentPublicDecks.tsx) batches SSR image lookup correctly.

### User-visible impact

**Perf/cost** — slower homepage for users with guest chat history; extra Scryfall rate-limit exposure. Commander strips add latency even when cache hits (20 HTTP round-trips).

### Recommended action

**Fix later**

1. **P0:** Replace per-name `commander-art` loops with one `POST /api/cards/batch-images` (or batch commander-art route) in both strips.
2. **P1:** Remove or gate **client-side** Scryfall fallback in `scryfall-cache.ts`; resolve all misses server-side in `batch-images`.
3. **P2:** Prewarm cache for top trending commanders from meta API.

### QA repro

1. Incognito `/` — Network: count `/api/commander-art` (~20).
2. With `guest_chat_messages` in `localStorage` containing `[[Card Name]]` refs — reload; watch **direct** `api.scryfall.com/cards/named` from browser.
3. Sentry performance waterfall on [NEXTJS-2Y](https://manatapai.sentry.io/issues/JAVASCRIPT-NEXTJS-2Y).

---

## 4. NEXTJS-2X — `/cards/:slug` `head > link` promise rejection

### Root cause: **Likely bot/crawler noise** (inconclusive for real users)

Unhandled promise rejection with `target: "head > link"`, no JS stacktrace. Card pages do not inject custom `<link>` tags; head links come from root layout + Next.js CSS/preload/prefetch ([`app/layout.tsx`](../app/layout.tsx), [`app/cards/[slug]/page.tsx`](../app/cards/[slug]/page.tsx)).

### Evidence

- **20 events, 20 unique card URLs** — one hit per slug (SEO crawl pattern).
- **Browser/OS:** **100% Chrome on Linux** across sampled events (datacenter geo: Newark, Ashburn, SF, etc.).
- **Burst:** Mostly 2026-06-02 – 2026-06-03; **no events after Jun 3** in current unresolved set.
- **Not Scryfall images** — card art uses body `<img>`, not `<head>` links.
- **Static assets OK:** `/favicon-*.png`, `/apple-touch-icon.png`, `/manifest.json` return **200** on production (verified 2026-06-09).

### User-visible impact

**No** for real users — pattern matches headless crawlers failing to load a stylesheet/prefetch link.

### Recommended action

**Ignore or filter in Sentry** — e.g. filter `head > link` rejections from Linux + Chrome 147 bot cluster, or lower priority. Revisit only if events resume on real mobile/desktop browsers.

### QA repro

1. Real browser → `https://www.manatap.ai/cards/sol-ring` — confirm no console rejection.
2. If investigating further: DevTools → log unhandled rejections → identify failing `<link href>`.

---

## Files referenced (fix pass)

| Issue | Primary files |
|-------|----------------|
| NEXTJS-32 | `app/build-a-deck/page.tsx`, `app/mtg-deck-checker/page.tsx` |
| NEXTJS-2 | `app/my-decks/[id]/DeckSidebar.tsx` (fix); `Client.tsx` (reference pattern) |
| NEXTJS-2Y | `TrendingCommandersStrip.tsx`, `PopularCommanderGuides.tsx`, `lib/scryfall-cache.ts`, `components/Chat.tsx` |
| NEXTJS-2X | `instrumentation-client.ts` (optional filter only) |

---

## Investigation methods used

- Sentry MCP: issue details, event lists, tag distributions, performance trace spans
- Production HTML/HTTP checks (JSON-LD shape, favicon status)
- Read-only Supabase: `scryfall_cache` coverage for popular commanders
- Static code trace (no application code changes)

---

## Fixes applied (2026-06-09)

| Issue | Change | Files |
|-------|--------|-------|
| **NEXTJS-2 / 35** | SSR-safe recommendations hide on mobile (`useState(true)` + `useEffect` viewport) | `app/my-decks/[id]/DeckSidebar.tsx` |
| **NEXTJS-32** | JSON-LD `@graph` instead of top-level array | `app/build-a-deck/page.tsx`, `app/mtg-deck-checker/page.tsx` |
| **NEXTJS-2Y** | Batch commander art; no browser Scryfall fallback | `lib/commander-art-batch.ts`, `TrendingCommandersStrip.tsx`, `PopularCommanderGuides.tsx`, `lib/scryfall-cache.ts` |
| **NEXTJS-2X** | Sentry filter for Linux Chrome `/cards/*` head-link rejections | `instrumentation-client.ts` |

### Verification notes

- **Hydration:** Playwright mobile viewport test in `tests/e2e/deck-management.spec.ts` — open first deck, assert no hydration console errors.
- **JSON-LD:** Page source should show `{ "@context": ..., "@graph": [...] }` not a top-level `[`.
- **Homepage N+1:** Network tab on `/` should show one `batch-images` POST from strips, zero direct `api.scryfall.com` fuzzy calls on load.
- **Post-deploy:** Monitor Sentry for regression on NEXTJS-2, 32, 2Y; confirm NEXTJS-2X events drop after filter deploy.
