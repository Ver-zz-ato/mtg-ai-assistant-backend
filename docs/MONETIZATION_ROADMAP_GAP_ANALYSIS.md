# ManaTap Monetization Roadmap — Gap Analysis & Implementation Plan

**Created**: February 2025  
**Purpose**: Compare current product state to the proposed monetization roadmap, outline gaps, and provide an implementation plan. Addresses AI cost burden, low traffic (80 new clicks/day), few Pro users, and "are we too early?" question.

---

## Part 1: Current Product State (What We Have)

### Pricing & Billing

| Item | Current State |
|------|---------------|
| **Pro price** | £1.99/mo, £14.99/year (37% discount) |
| **Stripe** | Full integration: checkout, webhooks, customer portal |
| **Pro status** | `checkProStatus()` / `useProStatus()` across 20+ features |
| **Thank-you flow** | Immediate sync on payment (1–2s), webhook backup |

### Core Features (Free)

- **Deck builder** — Full deck management, card search, add/remove
- **AI chat** — 50 messages/day (free), unlimited (Pro)
- **Deck analysis** — Full analysis for all users (no partial reveal)
- **Basic budget swaps** — Strict mode (no AI) free
- **Mulligan simulator** — Full 20k-iteration runs free (`/tools/mulligan`)
- **Probability calculator** — View calculations free; “run from tag” / advanced gated
- **Cost-to-finish** — Shopping list, price comparison, snapshot vs live — core free
- **Collections, wishlists** — Core CRUD free
- **Price tracker** — Basic search free; watchlist, history, deck value Pro
- **Browse public decks** — Free
- **Profile** — Public profile, basic customization free

### Pro-Gated Features (20+)

1. Unlimited chat  
2. AI budget swaps (with reasoning)  
3. Export to Moxfield/MTGO  
4. Fork deck with swaps  
5. “Explain why” on budget swaps  
6. Watchlist (price tracker)  
7. Deck value tracking (price history)  
8. Fix card names (batch)  
9. Set to playset (collections)  
10. Price snapshot refresh  
11. Custom cards (20 vs 5)  
12. Deck versions  
13. Probability helpers (full use)  
14. Hand Testing Widget (deck page)  
15. Build Assistant actions  
16. Wishlist advanced  
17. Deck comparison (AI)  
18. Price history charts  
19. Deck health interaction tab  
20. Pro badge  

### Conversion & Pro Triggers

- **Pro gates** — `showProToast()` when user hits a Pro feature
- **ProUpsellBanner** — Contextual banners (deck page, collections, cost-to-finish)
- **Guest value moments** — `guest_value_moment` events, limit modal variants
- **Conversion funnel** — PostHog events: `pro_gate_viewed`, `pro_upgrade_started`, `pro_upgrade_completed`
- **Homepage experiment** — Variant A/B for activation
- **Auth gates** — GuestLandingPage on `/my-decks`, `/collections`, `/price-tracker`

⚠️ **Key gap**: Pro triggers fire when the user *tries* to use a Pro feature. The roadmap’s “value moment” triggers (e.g. show Pro CTA *immediately after* delivering insight) are mostly not implemented.

### Cost-to-Finish (Current)

- Shopping list with prices  
- Price comparison (current vs snapshot)  
- Delta calculations  
- Multi-currency (USD, EUR, GBP)  
- Export CSV (with source)  
- Pro: Moxfield/MTGO export, AI budget swaps integration  

**Missing from roadmap**:
- “Cheapest completion version” optimizer  
- Price drop alerts  
- “Complete deck under £X” optimizer  
- “Estimated savings” display with Pro CTA  
- One-click “Buy missing cards” export with affiliate links  

### Mulligan Simulator (Current)

- Full London mulligan simulation  
- 20k iterations (configurable)  
- Deck import, land/success card presets  
- Free — no run limit  

**Missing from roadmap**:
- Free: 3 runs; Pro: “Run full 10,000-simulation analysis”  
- “Opening hand consistency score” as Pro  
- “Keep/mull probability” metrics  

### Deck Analysis (Current)

- Full analysis for everyone  
- Strengths, synergy, legality, recommendations  
- No partial reveal or blur  

**Missing from roadmap**:
- Partial reveal: 1 suggestion + blurred “Weakest 5 cards”, “Budget swaps”, etc.  
- CTA: “Unlock full report → Pro”  

### AI Costs & Usage

- **Chat**: 50 msg/day free, 1000/hr Pro  
- **Models**: gpt-4o-mini (cheap), gpt-5 for complex  
- **Optimizations**: Response caching, two-stage (outline → main), Layer 0, v2 context, deduplication  
- **Budget caps**: `llm_budget` in DB (optional)  
- **Monitoring**: `ai_usage` table, admin cost-summary  

**Cost pressure**: AI spend is a concern; many optimizations exist but guest/free usage can still drive cost without revenue.

---

## Part 2: Roadmap vs Current State — Gap Matrix

| Roadmap Idea | Current State | Gap | Effort |
|--------------|---------------|-----|--------|
| **Cost-to-finish “savings” CTA** | Has totals, no “save £X” framing | Add “Estimated savings: £X” + “Track price drops → Pro” CTA | Low |
| **Partial reveal on deck analysis** | Full analysis for all | Add partial reveal + blur + “Unlock full report → Pro” | Medium |
| **Mulligan: 3 free runs** | Unlimited free | Gate runs (3 free, Pro for more) | Low |
| **Value ribbon on deck page** | ProUpsellBanner only | “£X optimization value remaining” contextual ribbon | Medium |
| **Weekly insight email** | None | Build email job + template | Medium–High |
| **Price drop alerts** | Watchlist exists, no alerts | Implement alert job + email/push | High |
| **“Cheapest completion”** | Basic shopping list | Add optimizer logic | Medium |
| **One-click Buy export** | CSV export | Affiliate links, store grouping | Medium |
| **“Weakest 5 cards” analyzer** | General analysis | Dedicated “weakest cards” + Pro for full report | Medium |
| **Collection value intelligence** | None | Track value, “top gaining”, “sell now” | High |

---

## Part 3: Implementation Outline (Priority Order)

### Phase 1: Fast Wins (Month 0–1) — Low Effort, High Impact

**1. Cost-to-finish “savings” CTA**

- **Where**: `collections/cost-to-finish/Client.tsx` (or budget-swaps page)
- **Change**: After computing total, show “You could save £X using optimized purchasing” (if snapshot vs live delta exists). Add button: “Track price drops & save money → Pro”
- **Implementation**:  
  - Compute `yesterdayDelta` or similar “savings” metric  
  - Add conditional block: if `!isPro && savings > 0`, show CTA  
  - Link to `/pricing` with `?source=cost_to_finish_savings`

**2. Mulligan: 3 free runs**

- **Where**: `app/tools/mulligan/page.tsx`
- **Change**: Persist run count (localStorage or DB). After 3 runs, show “Run full 10,000-simulation analysis → Pro”
- **Implementation**:  
  - `runCount` in state/localStorage, increment on “Run”  
  - If `runCount >= 3 && !isPro`, show Pro gate (showProToast or inline CTA)  
  - Pro: unlimited runs  

**3. Deck analysis partial reveal (simple)**

- **Where**: `components/DeckSnapshotPanel.tsx` or deck analysis output
- **Change**: Show 1 full suggestion + blurred sections for “Weakest 5 cards”, “Budget swaps”, “Matchup weaknesses”. CTA: “Unlock full report → Pro”
- **Implementation**:  
  - If `!isPro`, truncate/clamp analysis output on server or client  
  - Add blurred overlay + “Unlock full report → Pro” button  
  - Pro: full analysis as today  

### Phase 2: Money-Moment Focus (Month 1–2)

**4. Cost-to-finish Pro+ framing**

- Add “Cheapest completion version” toggle (Pro) — requires cheapest-print logic
- Enrich “Estimated savings” with clearer copy
- Add “Complete deck under £X” input (Pro) — filter/optimize by max budget

**5. Value ribbon on deck page**

- **Where**: `app/my-decks/[id]/page.tsx` or `Client.tsx`
- **Logic**: Compute “potential optimization value” (e.g. from swap suggestions or cost-to-finish). Show: “This deck has £X potential optimization value remaining”
- **Implementation**:  
  - Optional API or client calc (e.g. sum of swap savings)  
  - Small ribbon component, link to upgrade modal  

### Phase 3: Retention & Intelligence (Month 2–4)

**6. Price drop alerts**

- Watchlist table exists; add `target_price` or `alert_on_drop`
- Cron job: compare current price to snapshot, send email if drop
- Requires: email sending, alert schema, user preferences

**7. Weekly insight email**

- Job: aggregate “3 cards in your decks dropped”, “completion cost fell by £X”
- Template + SendGrid/Resend/etc.
- GDPR and unsubscribe handling

**8. Collection value intelligence**

- New features: total value, “top gaining”, “cards to sell now”
- Requires: price history, aggregation, new UI

---

## Part 4: AI Cost Situation & Response

### Current Cost Reality

- **Problem**: AI usage (chat, deck analysis) is expensive; free/guest users consume tokens without revenue.
- **Existing mitigations**: Caching, model routing, two-stage, rate limits, optional budget caps.
- **Tensions**:  
  - More free value → better conversion  
  - More free value → more AI cost  
  - Stricter gates → less engagement, fewer conversions  

### Recommended Actions (No Code Changes Here)

1. **Enable budget caps** — Set `llm_budget` in `app_config` (e.g. daily $5, weekly $20). Already wired.
2. **Tighten guest limits** — Consider 20–30 chat messages for guests instead of 50.
3. **Gate deck analysis earlier** — One free full analysis per session/IP, then Pro or signup.
4. **Reduce token ceilings** — Review `chat-generation-config.ts`, lower max tokens where safe.
5. **Prioritize conversion** — Place Pro triggers at value moments so free usage converts to paid before scaling traffic.

---

## Part 5: “Are We Too Early?” — Strategic View

### Traffic: 80 New Clicks/Day

- **Reality**: ~2,400 new visitors/month. Conversion funnel has little volume.
- **Implication**: Optimizing conversion is important, but absolute numbers will stay small until traffic grows.
- **Recommendation**: Don’t pause monetization work. Implement high-impact triggers (cost-to-finish CTA, mulligan gate, partial reveal) so that when traffic grows, conversion is already tuned.

### Few Pro Users

- **Reality**: Low volume + typical 2–5% conversion → few Pro users.
- **Implication**: Revenue is limited; main goal is to validate that conversion can work at all.
- **Recommendation**: Focus on conversion *rate* and *value moments*, not headline revenue. Prove the funnel before scaling.

### Product Maturity

- **Strengths**: Real product, real usage, Stripe, Pro gates, conversion tracking.
- **Gaps**: Pro triggers are mostly “try to use → blocked” rather than “value delivered → upsell”.
- **Conclusion**: Not too early to monetize. The roadmap’s main idea — trigger Pro at *value moments* — is the right next step. You have the features; you need the triggers.

### Prioritization

1. **Cost control** — Budget caps, guest limits, analysis gate.
2. **Value-moment triggers** — Cost-to-finish, mulligan, partial reveal.
3. **Traffic** — SEO, content, distribution (separate from this doc).
4. **New features** — Price alerts, collection value, etc. can wait until conversions are working.

---

## Part 6: Summary Checklist

| Action | Owner | Priority |
|--------|-------|----------|
| Enable `llm_budget` in DB | DevOps | P0 |
| Cost-to-finish “savings” CTA | Dev | P0 |
| Mulligan 3-free-runs gate | Dev | P0 |
| Deck analysis partial reveal | Dev | P1 |
| Value ribbon on deck page | Dev | P1 |
| Consider guest chat limit reduction | Product | P1 |
| Price drop alerts | Backlog | P2 |
| Weekly insight email | Backlog | P2 |
| Collection value intelligence | Backlog | P2 |

---

## Appendix: Key Files Reference

| Area | Files |
|------|-------|
| Pro gates | `lib/pro-ux.ts`, `lib/server-pro-check.ts`, `hooks/useProStatus.ts` |
| Cost-to-finish | `app/collections/cost-to-finish/Client.tsx`, `app/api/collections/cost-to-finish/route.ts` |
| Mulligan | `app/tools/mulligan/page.tsx` |
| Deck analysis | `components/DeckSnapshotPanel.tsx`, `app/api/deck/analyze/route.ts` |
| Conversion tracking | `lib/analytics-pro.ts`, `docs/conversion-funnel.md` |
| AI cost | `docs/REDUCE_API_USAGE_GUIDE.md`, `lib/ai/runtime-config.ts` |
| Billing | `app/api/billing/*`, `lib/billing.ts`, `docs/STRIPE_PRO_IMPLEMENTATION.md` |
