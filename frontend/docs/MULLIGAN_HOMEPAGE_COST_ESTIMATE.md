# Mulligan Simulator on Homepage — Cost Estimate

**Date:** 2025-02-17  
**Scope:** Add Hand Testing Widget (mulligan simulator) to homepage with free runs (capped) and optional AI advice.  
**Goal:** Cost estimate for deciding free caps and AI advice viability.

---

## 1. Where in Code

### 1.1 Hand Testing Widget (Interactive Draw)

| Component | Path |
|-----------|------|
| **Widget UI** | `frontend/components/HandTestingWidget.tsx` |
| **Mulligan page** | `frontend/app/tools/mulligan/page.tsx` |
| **Deck page** | `frontend/app/my-decks/[id]/page.tsx` (via `DeckSidebar` / `Client`) |

**Current placement:** Hand Testing Widget is on `/tools/mulligan` (sidebar) and `/my-decks/[id]` deck pages. **Not on homepage.**

### 1.2 Bulk Simulation (10k+ iterations)

| Component | Path |
|-----------|------|
| **Page** | `frontend/app/tools/mulligan/page.tsx` |
| **Rate limit API** | `frontend/app/api/events/tools/route.ts` |
| **Auth** | Required (401 if unauthenticated) |

### 1.3 APIs Used by Hand Testing Widget

| API | Path | Purpose |
|-----|------|---------|
| **Batch images** | `POST /api/cards/batch-images` | Card images (Scryfall cache) |
| **Activity log** | `POST /api/stats/activity/log` | Telemetry (mulligan_ran) - in-memory memoCache |

### 1.4 LLM / AI Advice

- **Current:** No LLM in Hand Testing Widget. `AdviceBlock` in mulligan page is deterministic (client-side hypergeometric simulation).
- **Optional AI advice:** Would need a new endpoint (e.g. `/api/mulligan/advice`) that takes hand + deck + context and returns keep/mulligan advice.

---

## 2. Execution Path Per Run

### 2.1 Hand Testing Widget — Single Run (Draw → Keep/Mulligan)

| Step | Resource | Cost |
|------|----------|------|
| **Shuffle + draw** | Client-side (Fisher-Yates) | $0 |
| **POST /api/stats/activity/log** | In-memory memoCache | Negligible |
| **POST /api/cards/batch-images** | On first load only (per deck) | See below |

**Per-run server cost:** Effectively only **1 POST** to `/api/stats/activity/log` (no DB, no Supabase).

### 2.2 Card Images (One-time per deck load)

| Step | Resource | Cost |
|------|----------|------|
| **POST /api/cards/batch-images** | `memoCache` hit → no DB | $0 |
| **Cache miss** | `scryfall_cache` SELECT + Scryfall API (if needed) | ~1 DB read + ~0 Scryfall (free) |
| **Cache miss** | `scryfall_cache` UPSERT | ~1 DB write |

**Assumption:** ~74 unique cards per deck. Batch-images uses `getImagesForNamesCached` → scryfall_cache, then Scryfall if missing. Cache hit rate ~90%+ for typical decks.

### 2.3 Bulk Simulation (mull_run) — Auth Required

| Step | Resource | Cost |
|------|----------|------|
| **POST /api/events/tools** | Auth check, `checkDurableRateLimit`, `supabase.auth.updateUser` | 1 RPC + 1–2 DB ops |
| **Simulation** | Client-side only |

**Note:** Bulk simulation is **auth-only** and not on homepage. Homepage feature would be **Hand Testing Widget** only.

---

## 3. Rate Limiting & Gating

### 3.1 Current State

| User | Hand Testing Widget | Bulk Simulation |
|------|---------------------|-----------------|
| **Guest** | 3 free runs (localStorage only) | ❌ Auth required |
| **Logged-in Free** | 3 free runs (localStorage) | 5/day (durable) |
| **Pro** | Unlimited | 50/day |

**Gaps for homepage:**

- **No server-side rate limit** for Hand Testing Widget. `localStorage` is easily bypassed (clear storage, incognito).
- **No guest_session_token** for Hand Testing — it doesn’t call any rate-limited API.
- `/api/stats/activity/log` has no rate limit.

### 3.2 Proposed Cap Scheme (Homepage)

| Cap | Guest | Logged-in Free | Pro |
|-----|-------|----------------|-----|
| **Daily runs** | 10/day | 30/day | Unlimited |
| **Key** | `guest:hash(guest_session_token)` | `user:hash(user_id)` | — |
| **Fallback** | `ip:hash(x-forwarded-for)` if no guest token | — | — |

**Implementation:** Add `POST /api/mulligan/hand-test` or similar that:

1. Validates hand-test request (deck hash, hand size).
2. Calls `checkDurableRateLimit` with `guest:` or `user:` key.
3. Returns `{ allowed, remaining }` before client draws.

**Abuse resistance:** Cookie-based guest ID; IP fallback only when guest token missing.

---

## 4. Telemetry & Usage Assumptions

### 4.1 Existing Events

| Event | Source | Notes |
|-------|--------|------|
| `mulligan_ran` | `POST /api/stats/activity/log` | Fire-and-forget; in-memory only |
| `pro_feature_used` (hand_testing) | `trackProFeatureUsed` | PostHog (consent-gated) |
| `pro_gate_viewed` | HandTestingWidget | When free runs exhausted |

**No dedicated PostHog:** `mulligan_run`, `simulation_started` — not present. Activity log is in-memory only.

### 4.2 Traffic Assumptions (Homepage)

| Tier | Runs/day | Notes |
|------|---------|-------|
| **Low** | 100 | Early launch |
| **Medium** | 1,000 | Steady growth |
| **High** | 10,000 | Viral / SEO spike |

---

## 5. Cost Tables

### 5.1 A) Simulation-Only (No LLM)

**Per-run resources:**

- 1× `POST /api/stats/activity/log` → in-memory memoCache (no DB)
- 0–1× `POST /api/cards/batch-images` per deck load (first visit per deck)
- 1× `checkDurableRateLimit` (if new endpoint added) → 1 RPC + 1–2 DB ops

**Assumptions:**

- Vercel: ~$0.0000002/function invocation (free tier: 100k invocations)
- Supabase: ~$0.00001/row read (free tier: 500MB)
- Batch-images: ~1 call per 5 runs (same deck) → ~0.2 calls/run

| Cost | Low (100/day) | Medium (1k/day) | High (10k/day) |
|------|---------------|-----------------|----------------|
| **Function invocations** | ~$0.02/mo | ~$0.20/mo | ~$2/mo |
| **Supabase reads** | ~$0.01/mo | ~$0.10/mo | ~$1/mo |
| **Supabase writes** | ~$0.02/mo | ~$0.20/mo | ~$2/mo |
| **Total** | **~$0.05/mo** | **~$0.50/mo** | **~$5/mo** |

**Per 1,000 runs:** ~$0.005 (simulation-only).

---

### 5.2 B) Simulation + AI Advice (LLM)

**New endpoint:** `POST /api/mulligan/advice`

- Input: hand (7 card names), deck (optional decklist), format (Commander)
- Output: short keep/mulligan advice (2–4 sentences)

**Assumptions:**

- Model: `gpt-4o-mini` (default for small advice)
- Input: ~400 tokens (system + hand + deck snippet)
- Output: ~80 tokens
- Pricing: $0.15/1M in, $0.60/1M out
- Cost per call: (400 × 0.00015 + 80 × 0.0006) / 1000 ≈ **$0.00011**

**Assumption:** 20% of runs request AI advice.

| Cost | Low (100/day) | Medium (1k/day) | High (10k/day) |
|------|---------------|-----------------|----------------|
| **Simulation** | $0.05/mo | $0.50/mo | $5/mo |
| **AI advice** (20% opt-in) | $0.07/mo | $0.66/mo | $6.60/mo |
| **Total** | **~$0.12/mo** | **~$1.16/mo** | **~$12/mo** |

**Per 1,000 runs (with 20% AI):** ~$0.005 (sim) + ~$0.022 (AI) ≈ **~$0.027**.

---

### 5.3 Summary Cost Table

| Scenario | Low | Medium | High |
|----------|-----|--------|------|
| **A) Simulation-only** | $0.05/mo | $0.50/mo | $5/mo |
| **B) Simulation + AI (20%)** | $0.12/mo | $1.16/mo | $12/mo |
| **Per 1,000 runs (A)** | $0.005 | $0.005 | $0.005 |
| **Per 1,000 runs (B)** | $0.027 | $0.027 | $0.027 |

---

## 6. Recommendations

### 6.1 Free Caps

- **Guest:** 10 runs/day (cookie-based guest id)
- **Logged-in Free:** 30 runs/day
- **Pro:** Unlimited

### 6.2 Cost Controls

1. **Simulation:** Use existing `checkDurableRateLimit` + new endpoint.
2. **AI advice:**
   - Disable for guests (or 1/day cap).
   - Use `gpt-4o-mini` only.
   - Cache by `hash(hand + deck)` for identical requests (TTL 24h).
   - Pro: unlimited; Free: 5/day.

### 6.3 Homepage Default Deck

- Use a **fixed sample deck** (e.g. popular Commander deck) for guests.
- Avoids batch-images for every visitor; cache hit on first load.
- "Load your deck" CTA → `/tools/mulligan` or `/my-decks`.

---

## 7. TODOs / Unknowns

1. **Guest rate limit:** Hand Testing Widget has no server-side rate limit today. Need new endpoint or gate before draw.
2. **Default deck:** No shared sample deck yet. Need to define one (e.g. from `meta/trending`).
3. **AI advice:** No endpoint exists. Need to design prompt and route.
4. **PostHog:** No `mulligan_run` or `simulation_started` events. Consider adding for analytics.
5. **Scryfall API:** Batch-images uses Scryfall when cache misses. Scryfall rate limits ~10 req/s; cache should absorb most.
6. **Vercel pricing:** Assumes Hobby/Pro; actual costs may vary by plan.

---

## 8. File Reference

| Area | Files |
|------|-------|
| Hand Testing Widget | `components/HandTestingWidget.tsx` |
| Mulligan page | `app/tools/mulligan/page.tsx` |
| Activity log | `app/api/stats/activity/log/route.ts` |
| Batch images | `app/api/cards/batch-images/route.ts` |
| Durable rate limit | `lib/api/durable-rate-limit.ts` |
| Feature limits | `lib/feature-limits.ts` |
| Guest tracking | `lib/guest-tracking.ts` |
| Pro status | `lib/server-pro-check.ts`, `hooks/useProStatus.ts` |
| LLM (swap-why) | `app/api/deck/swap-why/route.ts` (reference for AI advice) |
| Pricing | `lib/ai/pricing.ts` |
