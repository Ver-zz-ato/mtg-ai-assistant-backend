# Testing Deck Analyze & AI Usage Changes

How to verify the BannedCardsBanner, ColorIdentityBanner, and AI usage admin changes work correctly.

---

## 1. BannedCardsBanner (no LLM)

**What changed:** Uses direct banned list lookup instead of `/api/deck/analyze`.

**How to test:**
1. Create or open a Commander deck.
2. Add a banned card (e.g. **Dockside Extortionist** – banned in Commander).
3. Save the deck and reload the page.
4. **Expected:** Red banner appears: "Banned Cards Detected" with the card name.
5. **Verify no AI call:** Check Admin → AI Usage. No new `deck_analyze` row should appear from `banned_cards_banner` (that source no longer calls the API).

**Edge case:** Add a card that's legal in Commander but banned in another format (e.g. Modern). Change deck format to Modern. Banner should show the banned card.

---

## 2. ColorIdentityBanner (no LLM)

**What changed:** Uses `/api/cards/batch-metadata` (Scryfall cache) instead of `/api/deck/analyze`.

**How to test:**
1. Create a Commander deck with a commander that has a narrow color identity (e.g. **Teysa Karlov** – W/B only).
2. Add a card outside that identity (e.g. **Counterspell** – blue).
3. Save and reload.
4. **Expected:** Red banner: "Color Identity Violation" listing the illegal card(s).
5. **Verify no AI call:** No new `deck_analyze` row from `color_identity_banner`.

**Note:** Cards must be in the Scryfall cache for color identity. If a card isn't found, it may be omitted from the illegal list (false negative). Most common cards are cached.

---

## 3. AI Usage Admin – Origin Tracking

**What changed:** Usage log shows exact page + component, with a `source_page` column and warnings for untracked calls.

**How to test:**
1. Go to **Admin → AI Usage** (Board tab).
2. Trigger some deck analyze calls from different places:
   - **Deck page:** Open a deck → Deck Checks → Deck Analyzer → Run.
   - **Homepage:** Paste a decklist in the right sidebar → Run.
   - **Profile:** Open Profile tab (may auto-run for badges).
3. Click **Reload** on the Usage log.
4. **Expected:**
   - **Page · Component** column shows e.g. `/my-decks/[id] · DeckAnalyzerPanel.tsx`.
   - **source_page** column shows e.g. `deck_page_analyze`, `deck_analyzer_expandable`, `profile`.
   - Rows without `source_page` show "—" and a ⚠ badge (highlighted in amber).
5. Use **Source** filter to show only calls from a specific component.
6. Click a row → **Details** modal shows Page, Component, Trigger, Cost impact.

**By source breakdown:** The "By source (page · component)" table shows cost per origin. Click a row to filter the log.

---

## 4. Quick Smoke Test (All Changes)

```bash
# Start dev server
cd frontend && npm run dev
```

1. Open a deck page → confirm BannedCardsBanner and ColorIdentityBanner work (add a banned/illegal card if needed).
2. Run Deck Analyzer → confirm analysis works.
3. Go to Admin → AI Usage → confirm new rows show `deck_page_analyze` in source_page and "Page · Component" displays correctly.

---

## 5. Cost Diagnosis Workflow

1. **Admin → AI Usage** → Board tab.
2. Check **By source** – which page/component has the highest cost?
3. Filter Usage log by that source (Source dropdown).
4. Click rows to see Details (trigger, cost impact).
5. **High impact + auto:** Consider gating or replacing with non-LLM logic.
6. **High impact + user_click:** Core feature – keep, but monitor.

**Call origins reference:** Expand "Call origins reference" at the bottom for the full mapping of `source_page` and `route` → page, component, trigger, cost impact.
