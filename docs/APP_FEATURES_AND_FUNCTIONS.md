# ManaTap AI — Website Features & Functions

> **Purpose:** Reference document for app version descriptions, release notes, changelogs, and marketing copy.  
> **Last updated:** February 2025

---

## Product Summary

**ManaTap AI** (formerly MTG AI Assistant) is an AI-powered Magic: The Gathering deck building assistant for Commander and other formats. It combines chat, deck analysis, price tracking, budget optimization, and probability tools to help players build, tune, and manage their decks.

**Target users:** Commander and EDH players, deck builders, budget-conscious players, collectors

**Tech stack:** Next.js, React, Supabase, OpenAI, Stripe, Scryfall API

---

## User-Facing Features (by Category)

### 1. AI Chat Assistant

| Feature | Description | Free tier | Pro tier |
|---------|-------------|-----------|----------|
| **Streaming AI Chat** | Real-time AI responses with deck context | 50 messages/day | 500 messages/day |
| **Deck-Aware Chat** | Chat about a specific deck; AI sees cards, curve, colors | ✅ | ✅ |
| **Card mentions** | Use `[[Double Brackets]]` to reference cards in chat | ✅ | ✅ |
| **Chat threads** | Save, rename, link threads to decks | ✅ | ✅ |
| **Guest mode** | Try chat without signup (limited) | 10 messages | — |
| **Build from playstyle** | "Build me a deck" from playstyle quiz results | ✅ | ✅ |

*Primary routes: `/api/chat/stream`, `/api/chat/route`, thread/message endpoints*

---

### 2. Deck Management

| Feature | Description |
|---------|-------------|
| **Create deck** | New deck from scratch or AI suggestion |
| **Edit deck** | Add/remove cards, adjust quantities |
| **Save deck** | Save with title, format, notes |
| **Clone deck** | Duplicate any deck (own or public) |
| **Import CSV** | Paste or upload decklist from Archidekt, Moxfield, etc. |
| **Batch import** | Import multiple decks from CSV |
| **Export** | Export to TCGPlayer or Moxfield |
| **Publish** | Make deck public for others to browse |
| **Versioning** | Save snapshots, compare versions |
| **Parse & fix names** | Auto-correct card names (fuzzy matching) |

*Pages: `/my-decks`, `/new-deck`, `/decks/[id]`, `/decks/[id]/edit`*

---

### 3. AI Deck Analysis

| Feature | Description | Free | Pro |
|---------|-------------|------|-----|
| **Deck analysis** | AI analysis: curve, ramp, draw, removal, synergy, slot planning | 20/day (guest 5) | 200/day |
| **Slot suggestions** | Recommended cards to fill open slots | ✅ | ✅ |
| **Health scan** | Quick deck health check | 10/day | 50/day |
| **Suggestion why** | "Explain why this card is recommended" | 20/day | 100/day |
| **Deck compare AI** | AI compares two decks (strengths, differences) | — | 20/day |

*Routes: `/api/deck/analyze`, `/api/deck/health-suggestions`, `/api/deck/suggestion-why`, `/api/deck/compare-ai`*

---

### 4. Budget & Pricing

| Feature | Description | Free | Pro |
|---------|-------------|------|-----|
| **Budget swap suggestions** | Cheaper alternatives for expensive cards (research-based) | 5/day | 50/day |
| **Swap why** | Explain why a specific swap works | 10/day | 100/day |
| **Cost to finish** | Estimate cost to complete deck vs. your collection | 5/day | 50/day |
| **Price tracker** | Historical prices, trends, top movers | 5/day | 50/day |
| **Deck cost** | Total deck value (USD/EUR) | ✅ | ✅ |
| **Price series** | Time-series price data for cards | ✅ | ✅ |
| **Reprint risk** | AI estimate of reprint likelihood | 10/day | 100/day |

*Pages: `/deck/swap-suggestions`, `/mtg-budget-swap-tool`, `/collections/cost-to-finish`, `/price-tracker`, `/mtg-deck-cost-calculator`*

---

### 5. Mulligan Simulator & Probability

| Feature | Description | Free | Pro |
|---------|-------------|------|-----|
| **Mulligan simulator** | London mulligan, keep rates for 7/6/5-card hands | 5/day | 50/day |
| **Mulligan AI advice** | "Keep or mull?" for a given hand + deck | 10/day (guest 2) | 50/day |
| **Probability calculator** | Hypergeometric: "Odds of drawing Sol Ring by T2?" | 5/day | 50/day |

*Pages: `/tools/mulligan`, `/commander-mulligan-calculator`, `/tools/probability`, `/mtg-probability-calculator`*

---

### 6. Collections & Wishlists

| Feature | Description |
|---------|-------------|
| **Collection upload** | Import collection via CSV |
| **Fuzzy match** | Match card names when importing |
| **Collection cost** | Total value of collection |
| **Cost to finish** | Cost to complete deck given cards you own |
| **Compare wishlist** | See what you still need from wishlist |
| **Wishlist** | Save cards you want to buy |
| **Watchlist** | Track prices of specific cards |
| **Price history** | Historical value of collection |

*Pages: `/collections`, `/collections/[id]`, `/collections/cost-to-finish`, `/wishlist`, `/wishlist/[id]`, `/watchlist`*

---

### 7. Playstyle Quiz

| Feature | Description |
|---------|-------------|
| **Playstyle quiz** | Questions to infer preferred playstyle |
| **Profile result** | Label (e.g. Value Engine, Aggro) + traits |
| **Commander suggestions** | Suggested commanders that match profile |
| **Archetype suggestions** | Suggested archetypes (tokens, aristocrats, etc.) |
| **AI explanation** | Personalized playstyle breakdown (sign-in) |
| **Build from quiz** | One-click "Build me a deck" from results |

*Accessed via Chat or My Decks; uses `/api/playstyle/explain`, `/api/playstyle/sync`*

---

### 8. Commander & Meta Discovery

| Feature | Description |
|---------|-------------|
| **Commander index** | Browse commanders by archetype, colors |
| **Commander page** | Guide, best cards, budget upgrades, mulligan tips |
| **Trending commanders** | Most popular / trending |
| **Meta page** | Meta overview and trends |
| **Archetypes** | Dragons, tokens, aristocrats, etc. |
| **Strategies** | Ramp, control, combo, etc. |
| **Browse public decks** | Search by format, colors, sort |

*Pages: `/commanders`, `/commanders/[slug]`, `/commanders/[slug]/mulligan-guide`, `/commanders/[slug]/best-cards`, `/commanders/[slug]/budget-upgrades`, `/commander-archetypes`, `/strategies`, `/meta`, `/decks/browse`*

---

### 9. Tools Index

| Tool | URL | Description |
|------|-----|-------------|
| Mulligan Simulator | `/tools/mulligan` | London mulligan simulation |
| Probability Calculator | `/tools/probability` | Hypergeometric draw odds |
| Cost to Finish | `/collections/cost-to-finish` | Deck completion cost vs. collection |
| Budget Swap Optimizer | `/deck/swap-suggestions` | Cheaper card alternatives |
| Price Tracker | `/price-tracker` | Price history and trends |
| Compare Decks | `/compare-decks` | Compare two decklists |

*Page: `/tools` (index of all tools)*

---

### 10. Account & Profile

| Feature | Description |
|---------|-------------|
| **Sign up / Sign in** | Email, Google (Supabase Auth) |
| **Profile** | View/edit identity, display name |
| **Pro status** | Subscription tier, billing portal |
| **Rate limit status** | See daily usage for chat and tools |
| **Delete account** | GDPR-compliant account deletion |
| **Custom card** | Custom card for profile (badge) |
| **User profile (public)** | `/u/[slug]` — public profile with decks |

*Pages: `/profile`, `/pricing`*

---

### 11. Billing & Subscriptions

| Feature | Description |
|---------|-------------|
| **Pro subscription** | Monthly or annual plan via Stripe |
| **Checkout** | Stripe Checkout for payment |
| **Billing portal** | Manage subscription, payment method |
| **Thank you page** | Post-purchase confirmation |

*Routes: `/api/billing/create-checkout-session`, `/api/billing/portal`*

---

### 12. Content & SEO

| Feature | Description |
|---------|-------------|
| **Blog** | Articles on deck building, AI, budget tips |
| **Card pages** | Individual card pages (Scryfall data) |
| **Short links** | `/q/[slug]` redirects |
| **Binder view** | `/binder/[slug]` — collection-style view |

*Pages: `/blog`, `/blog/[slug]`, `/cards`, `/cards/[slug]`*

---

### 13. Support & Legal

| Page | Purpose |
|------|---------|
| `/support` | Support, FAQ, contact |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |
| `/refund` | Refund policy |
| `/changelog` | What's new (version history) |

---

## API Capabilities (Reference)

### Public / User APIs

- **Chat:** Stream, threads, messages, history
- **Decks:** CRUD, save, clone, versions, publish, export (TCGPlayer, Moxfield)
- **Deck analysis:** Analyze, health suggestions, swap suggestions, swap why, suggestion why, compare
- **Collections:** Cards, upload CSV, fuzzy match, cost, cost-to-finish
- **Price:** Single card, trends, series, movers, deck series
- **Cards:** Search, batch lookup, reprint risk
- **Mulligan:** AI advice
- **Playstyle:** Explain, sync
- **Billing:** Create checkout, portal, confirm payment

### Cron / Background Jobs

- Price cache cleanup, deck costs, commander aggregates
- Meta signals, top cards, guest session cleanup
- Rate limit cleanup, ops reports
- Price snapshots, Scryfall prewarm

### Admin APIs (Internal)

- User search, Pro status, GDPR export/delete
- Deck bulk import, discovery, SEO pages
- AI test suite, usage, health
- Stripe sync, monetization stats
- Attribution, analytics, feedback

---

## Suggested App Version Copy

### Short (e.g. App Store subtitle, ~80 chars)

> AI deck builder for Commander: chat, analyze, budget swaps, mulligan, price tracking

### Medium (Feature list for release notes)

- AI chat assistant with deck context
- Deck analysis (curve, ramp, synergy, slot planning)
- Budget swap suggestions for cheaper alternatives
- Mulligan simulator and AI keep/mull advice
- Probability calculator (hypergeometric draw odds)
- Cost to finish (deck vs. your collection)
- Price tracker with trends and movers
- Playstyle quiz and commander suggestions
- Collection and wishlist management
- Browse commanders, archetypes, and public decks

### Long (Full feature list)

- **AI Chat:** Streaming chat with deck context, card mentions, threads
- **Deck Analysis:** Curve, ramp, draw, removal, synergy, slot suggestions
- **Budget:** Swap suggestions, swap explanations, cost to finish
- **Mulligan:** London mulligan simulator, AI keep/mull advice
- **Probability:** Hypergeometric calculator for draw odds
- **Price Tracker:** Historical trends, top movers, deck value
- **Collections:** CSV import, cost, cost to finish vs. wishlist
- **Playstyle Quiz:** Find your style, commander & archetype suggestions
- **Discovery:** Commanders, archetypes, strategies, public decks
- **Export:** TCGPlayer, Moxfield
- **Pro:** Higher limits, deck compare AI, more daily uses

---

## Rate Limit Summary (Free vs Pro)

| Feature | Guest | Free | Pro |
|---------|-------|------|-----|
| Chat messages | 10 | 50 | 500 |
| Deck analyze | 5 | 20 | 200 |
| Health scan | — | 10 | 50 |
| Budget swap AI | 5 | 5 | 50 |
| Swap why | 5 | 10 | 100 |
| Reprint risk | 5 | 10 | 100 |
| Mulligan sim | — | 5 | 50 |
| Mulligan AI advice | 2 | 10 | 50 |
| Probability | — | 5 | 50 |
| Cost to finish | — | 5 | 50 |
| Price tracker | — | 5 | 50 |
| Deck compare AI | — | — | 20 |

---

## External Integrations

| Service | Purpose |
|---------|---------|
| **Scryfall** | Card data, images, prices |
| **OpenAI** | Chat, deck analysis, embeddings |
| **Stripe** | Subscriptions, checkout |
| **Supabase** | Auth, database |
| **PostHog** | Product analytics |
| **Sentry** | Error tracking |

---

*Document generated from codebase exploration. Update as features change.*
