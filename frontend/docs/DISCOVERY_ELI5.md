# Discovery Phases — ELI5 (Explain Like I'm 5)

A super simple, per-phase guide to what we built and what changed on the website.

---

## Phase 1–2: Commander Workspace Upgrade

**What we did:** Made each commander page feel like a "workspace" instead of a boring list.

**What you see on the site:**
- When you visit a commander page (e.g. `/commanders/atraxa-praetors-voice`), you now get:
  - A **snapshot card** that says things like "Gameplan: Proliferate", "Difficulty: Medium"
  - A **tools panel** with 4 big buttons: Browse Decks, Mulligan Simulator, Cost to Finish, Budget Swaps
  - A **strategy snapshot** — 2–3 sentences about how that commander plays
  - A **popular decks** section that links to decks with that commander

**Why:** So visitors can quickly understand a commander and jump straight to the tools they need.

---

## Phase 3: Tools Hub + Commanders in Nav

**What we did:** Created a central "MTG Tools" page and put Commanders in the main menu.

**What you see on the site:**
- A new **/tools** page that lists all 5 tools (Mulligan, Probability, Cost to Finish, Budget Swaps, Price Tracker) with short descriptions
- **"Commanders"** in the top nav bar (desktop and mobile) — click it to go to `/commanders`
- Each tool page now shows **Popular Commanders** — e.g. "Common commander shells people use this tool for" with links to Atraxa, Edgar, Krenko, etc.
- Commander sub-pages (mulligan-guide, budget-upgrades, best-cards) now push **Browse Decks** first, then tools — not the AI chat

**Why:** So people can find tools and commanders easily, and we don't burn money on AI before they've tried free stuff.

---

## Phase 4: Commander Aggregates (Live Data)

**What we did:** Commander pages now show real data from public decks.

**What you see on the site:**
- On each commander page: **Most Played Cards** — the top 12 cards people actually run in that commander, with % inclusion
- **Recent Decks** — 6 links to real decks people have built
- This data is refreshed daily by a cron job

**Why:** So visitors see what the community is actually playing, not just generic advice.

---

## Phase 5: Commander Art

**What we did:** Put card art on commander pages.

**What you see on the site:**
- A **full-width banner** with the commander's card art on hub pages and content pages (mulligan-guide, budget-upgrades, best-cards)
- When you **hover** over a commander link (on /commanders or in Popular Commanders), a little card preview pops up with the art

**Why:** Makes pages look polished and helps people recognize commanders visually.

---

## Phase 6–7: Archetypes, Strategies, Cards, Meta

**What we did:** Added whole new sections of the site for discovery.

**What you see on the site:**
- **/commander-archetypes** — List of archetypes (Dragons, Aristocrats, Treasure, Spellslinger, Elfball, etc.). Click one to get a long guide.
- **/strategies** — List of strategies (Ramp, Tokens, Sacrifice, Control, Aggro, Combo). Same idea.
- **/cards** — List of top cards by deck count. Click one to see which commanders play it.
- **/meta** — Pages like "Trending Commanders", "Most Played Cards", "Budget Commanders" — meta signals from deck data

**Why:** So people can explore by playstyle (archetype/strategy) or by card, not just by commander name.

---

## Phase 8–9: Query-Driven Landing Pages (/q/...)

**What we did:** Built a system that creates new pages automatically from Google Search Console data.

**What you see on the site:**
- New URLs like **/q/atraxa-praetors-voice-cost** or **/q/korvold-fae-cursed-king-cost**
- These pages are **generated** from search queries people type into Google (e.g. "Atraxa deck cost", "Korvold cost to build")
- Each page has a template (commander cost, mulligan, card price, archetype, etc.) and links to tools
- They start as **noindex** — Google doesn't see them until we say so

**Why:** So we can capture traffic from long-tail search queries without manually writing hundreds of pages.

---

## Phase 9.5: Hardening (Resolver, Quality, Indexing)

**What we did:** Made the system smarter so we don't shoot ourselves in the foot.

**What changed:**

1. **No duplicates** — If a query like "Atraxa mulligan" would create a page that competes with our existing `/commanders/atraxa-praetors-voice/mulligan-guide`, we **skip it**. We only create pages for "gaps" (e.g. commander cost — we don't have a dedicated page for that).

2. **Quality score** — Each candidate gets a score. Low-quality stuff (e.g. "reddit", "proxy", "download", very short queries) is **skipped**.

3. **Indexing control** — New pages stay **noindex** until we manually flip them to "index". Only pages we're confident in go in the sitemap.

4. **Publish top 25** — We publish in small batches (25 at a time) instead of hundreds at once.

5. **Admin UI** — You can see quality score, impressions, clicks, and toggle indexing per page at `/admin/seo/pages`.

6. **Internal links** — Each /q/ page now shows **Popular Commanders** and **Top Cards** blocks at the bottom for SEO juice.

**Why:** So we don't cannibalize our own pages, don't pollute Google with thin content, and can promote winners gradually.

---

## TL;DR — What's on the site now

| Thing | Where |
|-------|-------|
| Commander hub | `/commanders`, `/commanders/[slug]` |
| Commander guides | `/commanders/[slug]/mulligan-guide`, `budget-upgrades`, `best-cards` |
| Tools | `/tools`, `/tools/mulligan`, `/tools/probability`, `/collections/cost-to-finish`, `/deck/swap-suggestions`, `/price-tracker` |
| Archetypes | `/commander-archetypes`, `/commander-archetypes/[slug]` |
| Strategies | `/strategies`, `/strategies/[slug]` |
| Cards | `/cards`, `/cards/[slug]` |
| Meta signals | `/meta`, `/meta/[slug]` |
| Auto landing pages | `/q/[slug]` (e.g. `/q/atraxa-praetors-voice-cost`) |
| Admin | `/admin/seo/pages` |
