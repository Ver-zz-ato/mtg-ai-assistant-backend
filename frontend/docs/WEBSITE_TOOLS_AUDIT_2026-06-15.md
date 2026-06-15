# Website Tools Audit — 2026-06-15

**Environment:** Production (`https://www.manatap.ai`)  
**Method:** HTTP route smoke, browser interaction (guest), API spot-checks  
**Signed-in pass:** Attempted with owner test account; browser sign-in modal did not complete in automation (password submit issue). Signed-in-only flows marked **not verified** below.  
**Scope:** All 16 tools on `/tools` hub. No code fixes in this pass.

## Executive summary

| Result | Count |
|--------|------:|
| Pass | 7 |
| Partial | 7 |
| Fail | 2 |

**P0 (broken hub links):** `/analyze`, `/roast`  
**P1 (works but misleading or painful):** Deck Compare guest gate vs “Free” badge; Deck Checker / analyze API very slow (~79s); hub “Analyze a Deck” duplicates Deck Checker intent but links to dead route  
**P2:** Budget Swaps redirect (`/budget-swaps` → `/deck/swap-suggestions`); stale e2e expecting `budget-swaps` URL; e2e route list gaps

### Recommended fix order (follow-up, not done here)

1. Add real pages or redirects: `/analyze` → `/mtg-deck-checker` (or new analyze UI); `/roast` → homepage community drawer anchor or dedicated roast page  
2. Deck Compare: either allow guest paste-compare or change hub badge to “Sign in”  
3. Deck analyze performance: `POST /api/deck/analyze` took **~79s** for a small Commander list (`partial: true`) — investigate timeout UX on Deck Checker  
4. Update `comprehensive-site.spec.ts` and `budget-swaps.spec.ts` for current routes

---

## Summary table

| # | Tool | Hub route | Resolves to | Guest status | Signed-in | Mobile API |
|---|------|-----------|-------------|--------------|-----------|------------|
| 1 | Build a Deck | `/build-a-deck` | same | **Partial** — page loads | Not verified | `generate-constructed`, `generate-from-collection` |
| 2 | Analyze a Deck | `/analyze` | POST-only route | **Fail** — 405, blank page | N/A | `POST /api/deck/analyze` (shared) |
| 3 | Mulligan Simulator | `/tools/mulligan` | same | **Pass** | Not verified | `POST /api/mulligan/advice` (optional) |
| 4 | Probability Calculator | `/tools/mulligan#probability` | same | **Pass** — hypergeom renders | Not verified | No |
| 5 | AI Workshop | `/ai-workshop` | same | **Partial** — page loads | Not verified | `transform`, `swap-suggestions`, `workshop-preflight` |
| 6 | Budget Swaps | `/budget-swaps` | 308 → `/deck/swap-suggestions` | **Partial** — UI OK | Not verified | **Yes** — `swap-suggestions` (app workshop) |
| 7 | Deck Compare | `/compare-decks` | same | **Partial** — signup wall only | Not verified | `compare-ai` |
| 8 | Deck Checker | `/mtg-deck-checker` | same | **Partial** — stuck “Checking deck…” | Not verified | `POST /api/deck/analyze` |
| 9 | Card Search | `/cards` | same | **Pass** | N/A | No |
| 10 | Price Tracker | `/price-tracker` | same | **Pass** | Not verified | `price/series`, `price/movers`, `price/deck-series` |
| 11 | Wishlist | `/wishlist` | same | **Partial** — sign-in expected | Not verified | Supabase wishlists |
| 12 | Collections | `/collections` | same | **Partial** — sign-in expected | Not verified | Supabase collections |
| 13 | Scan QR | `/tools/scan-qr` | same | **Pass** — page loads | N/A | No |
| 14 | Roast My Deck | `/roast` | **404** | **Fail** | N/A | `POST /api/deck/roast` |
| 15 | Commander Browser | `/commanders` | same | **Pass** | N/A | No |
| 16 | Meta | `/meta` | same | **Pass** | N/A | No |

---

## Per-tool detail

### 1. Build a Deck — Partial

- **Route:** `200` `https://www.manatap.ai/build-a-deck`
- **Guest:** Page renders format/budget/power UI.
- **Core action:** Not exercised (AI generate requires sign-in / limits).
- **APIs:** `POST /api/deck/generate-constructed`, `POST /api/deck/generate-from-collection`
- **Issues:** P2 — Limited badge accurate; full generate flow not verified without auth.
- **Mobile API impact:** No direct mobile mirror for website build flow.

### 2. Analyze a Deck — Fail (P0)

- **Route:** `GET /analyze` → **405 Method Not Allowed**; browser shows **blank document** (no UI).
- **Root cause:** [`app/analyze/route.ts`](../app/analyze/route.ts) only re-exports `POST` from `/api/deck/analyze` — no `page.tsx`.
- **Working alternative:** [`/mtg-deck-checker`](../app/mtg-deck-checker) uses same analyze API with full UI.
- **Hub impact:** “Analyze a Deck” (Popular) is a dead link for normal users.
- **Mobile API impact:** **Yes** — mobile uses analyze APIs; website hub link is wrong, not the API.

### 3. Mulligan Simulator — Pass

- **Route:** `200` `/tools/mulligan`
- **Guest:** Example Ur-Dragon deck pre-loaded; **Run** completes London mull sim; hand widget (“Click to draw 7 cards!”) present; “3 free runs remaining” shown.
- **APIs:** Client-side math primary; optional `POST /api/events/tools`, `POST /api/mulligan/advice` for AI hand help.
- **Issues:** P2 — Guest deck import dropdown shows “Please create an account…” (expected).
- **Mobile API impact:** **Yes** — `mulligan/advice` shared with app.

### 4. Probability Calculator — Pass

- **Route:** Embedded at `/tools/mulligan#probability`; `/tools/probability` redirects here (308).
- **Guest:** Default calc shows **71.03%** hit chance (N=99, K=10, 11 cards seen) without running.
- **APIs:** Optional `POST /api/deck/color-sources`, `parse-and-fix-names` when parsing pasted lists.
- **Issues:** None blocking.
- **Mobile API impact:** No.

### 5. AI Workshop — Partial

- **Route:** `200` `/ai-workshop`
- **Guest:** Page loads (dynamic client).
- **Core action:** Transform / budget passes not run (typically requires sign-in; Bearer on website).
- **APIs:** `workshop-preflight`, `transform`, `swap-suggestions` (`sourcePage: ai_workshop_budget`)
- **Issues:** P2 — not verified end-to-end without auth.
- **Mobile API impact:** **Yes** — app AI Workshop budget uses `swap-suggestions` with `app_ai_workshop_budget`.

### 6. Budget Swaps — Partial

- **Route:** Hub `/budget-swaps` → **308** → `/deck/swap-suggestions` (`200`).
- **Guest UI:** Paste deck, Quick vs Pro AI modes, Compute button; threshold removed from UI (matches recent deploy).
- **API test (guest, small deck, `ai: true`):**
  - `POST /api/deck/swap-suggestions` → `200` in **~3s**
  - `ok: true`, `suggestions: []`, `emptyReason: ai_no_suggestions`, `stats.ai.outcome: empty`
- **Issues:**
  - P2 — Permanent redirect may confuse bookmarks/tests expecting `/budget-swaps` URL.
  - P2 — Quick mode on niche decks still expected empty (`no_curated_sources_in_deck` on staple-less lists).
- **Mobile API impact:** **Yes** — same endpoint; app workshop path unchanged.

### 7. Deck Compare — Partial (P1)

- **Route:** `200` `/compare-decks`
- **Guest:** **GuestLandingPage** only — signup form, no paste/compare tool.
- **Hub badge:** “Free” — **misleading**; comparison tool requires account (matches code: `compare-decks/page.tsx` gates on `user`).
- **Issues:** P1 — Badge/expectation mismatch.
- **Mobile API impact:** **Yes** — `compare-ai` used by app.

### 8. Deck Checker — Partial (P1)

- **Route:** `200` `/mtg-deck-checker`
- **Guest:** “Try sample Commander deck” loads Krenko list; UI stuck on **“Checking deck…”** for **60+ seconds** in browser.
- **API test (same analyze endpoint):**
  - `POST /api/deck/analyze` → `200` in **~79s**
  - Response included `score: 68`, `partial: true`, deterministic bands — API works but **very slow**.
- **Issues:** P1 — UX looks hung; likely needs loading timeout messaging or faster/partial-first response.
- **Mobile API impact:** **Yes** — shared analyze stack (mobile has wrapper route).

### 9. Card Search — Pass

- **Route:** `200` `/cards`, `200` `/cards/sol-ring`
- **Guest:** Index and card slug pages load.
- **Issues:** None from smoke test.
- **Mobile API impact:** No.

### 10. Price Tracker — Pass

- **Route:** `200` `/price-tracker`
- **APIs:**
  - `GET /api/price/movers?...` → `200`
  - `GET /api/price/series?names[]=Sol Ring&...` → `200`
- **Guest:** Page loads; chart/movers depend on client fetch (APIs healthy).
- **Issues:** P2 — Deck history (`deck-series`) not verified without signed-in deck.
- **Mobile API impact:** Indirect (price cache patterns).

### 11. Wishlist — Partial

- **Route:** `200` `/wishlist`
- **Guest:** Sign-in / landing pattern (hub badge “Sign in” is correct).
- **Signed-in:** Not verified.
- **Mobile API impact:** App has wishlist flows; website uses `/api/wishlists/*`.

### 12. Collections — Partial

- **Route:** `200` `/collections`
- **Guest:** Sign-in / landing (hub badge correct).
- **Signed-in:** Not verified.
- **Mobile API impact:** App collection screens; website `/api/collections/*`.

### 13. Scan QR — Pass

- **Route:** `200` `/tools/scan-qr`
- **Guest:** `ScanQrClient` page renders.
- **Core action:** Paste share URL not exercised in automation.
- **Issues:** P2 — functional test deferred.
- **Mobile API impact:** No (client-side URL routing).

### 14. Roast My Deck — Fail (P0)

- **Route:** `GET /roast` → **404**; browser **blank document**.
- **Actual entry:** `DeckRoastPanel` on **homepage** / community drawer (`components/DeckRoastPanel.tsx`) → `POST /api/deck/roast`, permalink `/roast/[id]`.
- **Issues:** P0 — Tools hub links to non-existent `/roast` index page.
- **Mobile API impact:** No dedicated app roast screen found; API website-only.

### 15. Commander Browser — Pass

- **Route:** `200` `/commanders`
- **Guest:** Index loads with commander cards and links to guides.
- **Issues:** None from smoke test.
- **Mobile API impact:** No.

### 16. Meta — Pass

- **Route:** `200` `/meta`, `200` `/meta/trending-commanders` (~103KB HTML)
- **Guest:** Meta index and subpages load.
- **Issues:** None from smoke test.
- **Mobile API impact:** No.

---

## Tools hub (`/tools`)

- **Status:** Pass
- All 16 cards render with correct titles and badges.
- **Broken destinations from hub:** Analyze (#2), Roast (#14).

---

## Test / CI drift (P2)

- [`tests/e2e/budget-swaps.spec.ts`](../tests/e2e/budget-swaps.spec.ts) expects URL to contain `budget-swaps`; production redirects to `/deck/swap-suggestions`.
- [`tests/e2e/comprehensive-site.spec.ts`](../tests/e2e/comprehensive-site.spec.ts) omits `/analyze`, `/roast`, `/build-a-deck`, `/mtg-deck-checker` from static 200 list.

---

## Verification limits

| Area | Verified | Not verified |
|------|----------|--------------|
| Guest route smoke | 16/16 routes | — |
| Guest core actions | Mulligan, Probability, partial Budget Swaps API | Build generate, Workshop transform, Compare, signed-in wishlist/collections |
| Signed-in (test account) | — | Auth automation failed; manual sign-in recommended for Workshop, Compare, deck-series, Pro AI swaps |
| Pro tier | — | Pro AI swaps, Compare coach, export gates |

---

## Security note

Test account credentials were provided in chat for this audit only. They are **not** stored in this document. Consider rotating the password if the chat log is retained.
