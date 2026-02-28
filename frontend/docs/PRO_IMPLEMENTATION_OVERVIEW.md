# Pro Implementation Overview

This document describes Pro status, access levels (Guest / Logged-in / Pro), and where limits and Pro gates are enforced across pages and APIs.

---

## 1. Access Levels

| Level | Description |
|-------|-------------|
| **Guest** | Not logged in. Uses `guest_session_token` (middleware). Limited chat, no persistent threads, no My Decks / Profile / etc. |
| **Logged-in (Free)** | Authenticated, `profiles.is_pro = false` (or not set). Full access to free features; Pro features gated or rate-limited. |
| **Pro** | Authenticated, `profiles.is_pro = true` or `user_metadata.pro` / `user_metadata.is_pro = true`. Pro features and higher limits. |

---

## 2. Pro Status Resolution

- **Server:** `lib/server-pro-check.ts` → `checkProStatus(userId)`. Uses `profiles.is_pro` first, then `user_metadata.is_pro` / `user_metadata.pro`. OR logic; either true → Pro.
- **Client:** `hooks/useProStatus.ts` → `useProStatus()`. Fetches `profiles.is_pro` and `user_metadata`; fallback to `/api/user/pro-status` if profile query fails. Subscribes to `profiles` changes for real-time updates.
- **API:** `GET /api/user/pro-status` returns `{ ok, isPro, fromProfile, fromMetadata }`. Auth required.

---

## 3. Pro UX Helpers

- **`lib/pro-ux.ts`** → `showProToast()`. Toast: *"This is a Pro feature. Upgrade to Pro for just £1.99/month…"*
- **Pro guard pattern:** Many components check `isPro` before opening Pro features; if not Pro, they call `showProToast()` (or `alert`) and return.

---

## 4. Limits by User Type

### 4.1 Chat

| Limit | Guest | Logged-in (Free) | Pro |
|-------|--------|-------------------|-----|
| **Message cap** | 10 total (lifetime of guest session) | — | — |
| **Daily messages** | — | 50 | 500 |
| **Per-minute burst** | — | 20 | 20 |
| **Threads** | None (no threads) | 30 max | Unlimited |
| **Enforcement** | `lib/api/guest-limit-check.ts` (`GUEST_MESSAGE_LIMIT`), `guest_sessions` table | `/api/chat` + `/api/chat/stream`: `checkDurableRateLimit` + `checkFreeUserLimit` / `checkRateLimit` | Same APIs, higher daily cap |

- **Guest:** Warnings at 5, 7, 9 messages; modal at 10. `GuestLimitModal`, `Chat` client logic.
- **Stream:** `/api/chat/stream` uses durable daily limit (50 vs 500) and in-memory 20/min limit for authenticated users.

### 4.2 API Rate Limiting (Generic)

- **`lib/api/rate-limit.ts`:** In-memory rate limit.
  - **Free:** 100 requests/hour.
  - **Pro:** 1000 requests/hour.
- **Usage:** `getRateLimitTier(isPro)`, `checkRateLimit()`, `withRateLimit()`, `getRateLimitStatus()`. Used by `GET /api/rate-limit/status` (auth required). **Note:** Most routes use **durable** rate limits (DB-backed) rather than this generic one.

### 4.3 Deck Analyze (`/api/deck/analyze`)

| User | Daily limit |
|------|-------------|
| Unauthenticated | 5 |
| Logged-in (Free) | 20 |
| Pro | 200 |

- **Enforcement:** `checkDurableRateLimit` with `user:` or `guest:` / `ip:` key.

### 4.4 Deck Swap Suggestions (`/api/deck/swap-suggestions`)

| User | Daily limit |
|------|-------------|
| Free | 10 |
| Pro | 100 |

- **Enforcement:** `checkDurableRateLimit`.

### 4.5 Deck Health Suggestions (`/api/deck/health-suggestions`)

- **Access:** Pro only. Returns 403 if not Pro.
- **Daily cap:** 50 requests/user (Pro).

### 4.6 Deck Compare AI (`/api/deck/compare-ai`)

- **Daily cap:** 20/day (no Pro vs Free split in limit; auth required).

### 4.7 Deck Swap Why (`/api/deck/swap-why`)

- **Daily limit:** Pro vs Free (see route). Uses `checkDurableRateLimit`.

### 4.8 Cards Reprint Risk (`/api/cards/reprint-risk`)

- **Daily limit:** Pro vs Free. Uses `checkDurableRateLimit`.

---

## 5. Pro-Only API Routes

| Route | Check | Behavior if not Pro |
|-------|--------|----------------------|
| **`/api/deck/health-suggestions`** | `checkProStatus` | 403, "Deck Health features are Pro-only…" |
| **`/api/watchlist/update`** | `checkProStatus` | 403 |
| **`/api/watchlist/add`** | Profile `is_pro` or `user_metadata.pro` | 403 |

---

## 6. Pro-Gated UI (Pages & Components)

### 6.1 Deck Page (`/my-decks/[id]`)

- **Build Assistant (sticky):** AI scan, balance curve, budget swaps, “Fix” per health item, Undo/Redo → Pro. Else `showProToast()` / guard.
- **Functions Panel:** “Fix card names” → Pro. Deck Version History → Pro.
- **Deck Overview / Health:** Clicking health categories for AI suggestions → Pro. `DeckAssistant` health clicks → Pro.
- **Probability panel:** Full usage (K, N, H, T, k, tags, etc.) → Pro. Free users see disabled controls and “Pro only” copy.
- **Recompute button:** Uses `isPro` for analytics.
- **Unrecognized Cards Banner → Fix:** Pro. `Client` passes `isPro`; fix modal guarded.

### 6.2 Budget Swaps / Swap Suggestions (`/deck/swap-suggestions`)

- **AI mode, “Apply to Deck”:** Pro. Else `showProToast()`.
- **Deck forking with swaps:** Pro.

### 6.3 Cost to Finish (`/collections/cost-to-finish`)

- **“Why?” per row, 30‑day sparkline, bulk “Apply” swaps, etc.:** Pro. Else `showProToast()` or guard.

### 6.4 Price Tracker (`/price-tracker`)

- **“Add to chart” from Top Movers, deck selector for chart:** Pro. Else `showProToast()`.
- **Top Movers “Trend” column and related interactions:** Pro.

### 6.5 Hand Testing Widget

- **Pro:** Unlimited runs.
- **Free:** 3 free runs (stored in `localStorage` `hand_testing_free_runs`). After that, Pro upsell.

### 6.6 Wishlist

- **Batch Fix Names modal / apply:** **FREE** feature (no longer Pro-gated).

### 6.7 Watchlist

- **Add / update (API):** Pro. UI reflects this.

### 6.8 Profile

- **Rate limit indicator:** Shown for Pro users (usage vs higher limit).
- **Pricing section:** Different UX for Pro vs Free (e.g. billing portal vs upgrade CTA).

---

## 7. Auth-Required Surfaces

- **My Decks,** **Profile,** **Collections,** **Wishlist,** **Watchlist,** **Thank-you:** Require login. No explicit redirect in middleware; pages/components assume auth or show login prompts.
- **Deck page:** Uses `useAuth` / server auth; Pro status from `checkProStatus` on server and `useProStatus` on client.
- **APIs** such as `/api/user/pro-status`, `/api/rate-limit/status`, `/api/deck/health-suggestions`, wishlist/watchlist routes require authentication.

---

## 8. Guest-Specific Behavior

- **Chat:** 10-message cap, warnings at 5/7/9, modal at 10. No threads; messages not persisted in `chat_threads` / `chat_messages`.
- **Guest exit warning:** `GuestExitWarning` when navigating away with active guest chat.
- **Deck analyze:** 5/day for unauthenticated users (by guest token or IP).
- **No access** to My Decks, Profile, Collections, Wishlist, Watchlist, or other authenticated-only features.

---

## 9. File Reference

| Area | Files |
|------|--------|
| **Pro status** | `lib/server-pro-check.ts`, `hooks/useProStatus.ts`, `app/api/user/pro-status/route.ts` |
| **Pro UX** | `lib/pro-ux.ts` (`showProToast`) |
| **Guest limits** | `lib/api/guest-limit-check.ts`, `GUEST_MESSAGE_LIMIT`, `guest_sessions` |
| **Rate limiting** | `lib/api/rate-limit.ts`, `lib/api/durable-rate-limit.ts`, `app/api/rate-limit/status/route.ts` |
| **Chat** | `app/api/chat/route.ts`, `app/api/chat/stream/route.ts`, `components/Chat.tsx`, `components/GuestLimitModal.tsx` |
| **Deck** | `app/my-decks/[id]/page.tsx`, `BuildAssistantSticky`, `FunctionsPanel`, `DeckOverview`, `DeckProbabilityPanel`, `Client`, etc. |
| **APIs** | `app/api/deck/analyze`, `app/api/deck/health-suggestions`, `app/api/deck/swap-suggestions`, `app/api/deck/swap-why`, `app/api/deck/compare-ai`, `app/api/wishlists/fix-names/apply`, `app/api/watchlist/*`, `app/api/cards/reprint-risk` |
| **Cost to Finish** | `app/collections/cost-to-finish/Client.tsx` |
| **Price Tracker** | `app/price-tracker/page.tsx`, `app/price-tracker/TopMovers.tsx` |
| **Hand Testing** | `components/HandTestingWidget.tsx` |

---

## 10. Summary Table

| Feature | Guest | Logged-in (Free) | Pro |
|--------|--------|-------------------|-----|
| **Chat messages** | 10 total | 50/day, 20/min | 500/day, 20/min |
| **Chat threads** | — | 30 max | Unlimited |
| **Deck analyze** | 5/day | 20/day | 200/day |
| **Deck swap suggestions** | — | 10/day | 100/day |
| **Deck health AI** | — | ❌ | ✅ (50/day) |
| **Fix card names (wishlist)** | — | ❌ | ✅ |
| **Watchlist add/update** | — | ❌ | ✅ |
| **Hand testing** | 3 free runs | 3 free runs | Unlimited |
| **Build Assistant AI** | — | ❌ | ✅ |
| **Cost to Finish “Why?” / sparkline / bulk apply** | — | ❌ | ✅ |
| **Price Tracker deck chart / Top Movers add** | — | ❌ | ✅ |
| **Deck Version History** | — | ❌ | ✅ |
| **Generic API rate limit** | — | 100/hr | 1000/hr |
| **Rate limit status API** | ❌ (401) | ✅ (shows Free tier) | ✅ (shows Pro tier) |

---

*See also `feature_tracker.md` for historical feature and limit notes, and `ANALYTICS_IMPLEMENTATION.md` for analytics and PRO funnel tracking.*
