# Changelog Entry & Blog Post — March 2025

## Supabase SQL (recommended)

**Run this in Supabase SQL Editor** (Dashboard → SQL Editor → New query):

```
frontend/db/migrations/085_changelog_and_blog_march_2025.sql
```

This adds both the changelog entry and blog metadata in one go. No JSON paste needed.

---

## 1. Changelog Entry (What's New)

**Alternative:** Admin → Changelog (or POST to `/api/admin/changelog`). The changelog is stored in Supabase `app_config` with key `changelog`. The form doesn't accept raw JSON — use the SQL migration above.

**Entry to add:**

```json
{
  "version": "March 2025",
  "date": "2025-03-06",
  "title": "Deck building upgrades: Finish Deck, Build from Collection & smarter suggestions",
  "description": "We've added several deck-building improvements: Finish This Deck (AI suggests cards to reach 100), Build Deck From Collection with preview-before-create, and smarter Card Suggestions that follow color identity with hover-to-preview.",
  "features": [
    "Finish This Deck — AI suggests cards to fill gaps (Build Assistant + insufficient-cards banner)",
    "Build Deck From Collection — Generate Commander decks from your cards; preview modal before creating",
    "AI Deck Generator (Commander page) — Same preview flow for modules A/B/C/D",
    "Card Suggestions — Now respect Commander color identity; hover art for full image popup"
  ],
  "fixes": [
    "AI deck generation now enforces exactly 100 cards and strict color identity",
    "Removed History/Undo/Redo from Build Assistant panel"
  ],
  "type": "feature"
}
```

---

## 2. Blog Post

**SQL migration above** adds the blog listing entry to `app_config.blog`. The full content lives in the codebase:
- `app/blog/[slug]/page.tsx` — full content under slug `deck-building-upgrades-march-2025`

**Slug:** `deck-building-upgrades-march-2025`

**Metadata:**
- **Title:** New Deck Building Features: Finish This Deck, Build From Collection & Smarter AI
- **Excerpt:** AI now helps you complete partial decks, generate Commander decks from your collection with a preview step, and gives color-identity–compliant card suggestions with hover previews.
- **Date:** 2025-03-06
- **Author:** ManaTap Team
- **Category:** Announcement
- **Read time:** 6 min read
- **Gradient:** from-purple-600 via-pink-600 to-rose-600
- **Icon:** ✨

**Body (markdown):**

```markdown
We've shipped several deck-building improvements designed to make it easier to complete decks, use your collection, and get smarter suggestions.

## Finish This Deck

When your Commander deck is short of 100 cards — or your 60-card deck is under 60 — you’ll see a clear warning. Now we’ve added a **Finish This Deck** action in two places:

1. **Build Assistant** — Under Quick Actions, next to Legality Check and Balance Curve. One click opens AI suggestions to fill the gap.
2. **Insufficient cards banner** — When the warning appears, a purple **Finish This Deck** button is right there: *"AI suggests cards to fill the gap"*.

The AI analyzes your deck’s colors, ramp, draw, removal, and theme, then suggests cards that fit. Add them one by one or in bulk.

## Build Deck From Collection

Generate Commander decks from cards you already own. Pick a collection, then choose:

- **Guided** — Choose commander, playstyle, power level, budget
- **Build It For Me** — AI picks a commander and builds automatically
- **Find My Playstyle** — Take a short quiz and get commander suggestions

The flow has changed: instead of immediately creating a deck, you now get a **preview modal** first. See the commander (with art), the card list, and the deck’s aim. You can **Create Deck** or **Discard** — no more surprise decks with too many cards or off-color slips.

The same preview-before-create flow applies to the **AI Deck Generator** on the Commander deck builder page (Find My Playstyle, Commander Finder, Archetype Builder, Generate Deck).

## Smarter Card Suggestions

Deck-page card suggestions now:

- **Respect color identity** — No more off-color recommendations for Commander
- **Support hover preview** — Hover over the small card art to see the full card image

## Under the Hood

- AI deck generation now enforces **exactly 100 cards** and **strict commander color identity**
- We’ve simplified the Build Assistant panel by removing History/Undo/Redo

Try these features on [ManaTap AI](https://manatap.ai) — and if you like them, consider [going Pro](https://manatap.ai/pricing) for higher limits and premium models.
```
