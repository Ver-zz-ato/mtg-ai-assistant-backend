# ManaTap — Multi-Format Support Audit

**Date:** 2026-04-27  
**Scope:** `Projects/mtg_ai_assistant/frontend` (Next.js web app; no `app/(tabs)/` — mobile surfaces use `/api/mobile/*` and shared API routes)  
**Constraint:** Read-only audit (no code changes in this pass)

---

## 1. Executive summary

### What already supports multiple formats

- **`decks.format`** is stored (typically lowercase: `commander`, `standard`, `modern`, `pioneer`, `pauper`) with API validation in `app/api/decks/[id]/format/route.ts` for those five values.
- **`lib/deck/formatCompliance.ts`** and **`components/FormatCardCountBanner.tsx`**: Commander → 100 cards; Standard/Modern/Pioneer/Pauper → 60 (aggregate count from `deck_cards`, no main/side split).
- **`lib/deck/mtgValidators.ts`**: Broad Scryfall legality key mapping (`userFormatToScryfallLegalityKey`), ADD/CUT syntax (`commander` vs `sixty`), color-identity rules for Commander/Brawl-style formats, ban-list key mapping for curated buckets.
- **`lib/data/get-banned-cards.ts`** + cron: Commander, Modern, Pioneer, Standard, Pauper, Brawl ban overlays (Legacy/Vintage/Timeless not in curated JSON buckets).
- **`lib/data/format-knowledge/`** (JSON + `getFormatKnowledge`): Commander, Modern, Standard, Pioneer, Pauper — injected in **`app/api/chat/route.ts`** when a format is inferred.
- **Roast** (`app/api/deck/roast/route.ts`, `app/api/mobile/deck/roast-ai/route.ts`) accepts Commander, Modern, Pioneer, Standard.
- **Non-Commander affordances:** **`lib/deck/maybeFlexCards.ts`** — “Maybe/Flex” bucket in `decks.data`/meta, enabled for non-Commander formats; **`CardsPane`**, **`page.tsx`** use deck card colors for non-Commander color balance.
- **Health report** (`app/api/decks/health-report/route.ts`): normalizes format to `Commander | Modern | Pioneer` for deterministic facts (Standard/Pauper fall through to Commander in `normalizeFactsFormat`).

### What is Commander-only

- **Product surface:** Discover/meta (`meta-signals`, trending commanders), commander guides, precons, many SEO/blog routes.
- **Deck inference & analysis core:** `lib/deck/inference.ts` `InferredDeckContext.format` is **`"Commander" | "Modern" | "Pioneer"` only** — no first-class Standard/Pauper in the type system; `detectFormat()` maps “pioneer|standard” in chat to **Pioneer** (so Standard is mis-modeled in analysis heuristics).
- **Commander baselines, profiles,** `COMMANDER_ONLY_CARDS` filtering, ramp/draw/removal “readiness” bands, **`rules-facts.ts`**, **`commander-grounding`**, and much of **chat stream** are Commander-shaped.
- **UI:** `DeckOverview`, `ColorIdentityBanner` (with commander), singleton banner (when `format === 'commander'`), many deck tools default **format to Commander** in requests.

### Biggest blockers for 60-card (and 75-sideboard) formats

1. **No zone model:** `deck_cards` is **flat** `(deck_id, name, qty)` — sideboard and commander zone are not persisted separately; `parseDeckText` strips `SB:` / `CMDR:` and merges into one pool (so **60 main + 15 side counts as 75** and fails “60 cards” checks).
2. **Analyze / inference** assume **three** constructed identities for core logic, not five; **Standard** is not a first-class path in `inferDeckContext` and **`DeckAnalyzerPanel` hardcodes `format: 'Commander'`** to `/api/deck/analyze` regardless of selected format.
3. **No 4-of validation** (only singleton enforcement for Commander via **`SingletonViolationBanner`**, which is correctly gated to Commander in **`app/my-decks/[id]/Client.tsx`**).
4. **Brawl, Historic, Timeless, Legacy, Vintage** are largely absent from stored deck formats, UI selectors, and curated ban lists (Scryfall keys exist in `mtgValidators` for some; `userFormatToBannedDataKey` does not include Legacy/Vintage).

### Safest next implementation path

1. **Normalize** format strings in one place (canonical enum + display labels + DB lowercase).
2. **Plumb** real `decks.format` (and later zones) into **analyze** and **Finish Deck** flows — no schema migration required for the first fix.
3. **Add** `mainboard` / `sideboard` (or `zone`) to `deck_cards` + import/export in a later phase once UX is defined.

---

## 2. Data model audit

| Area | Findings |
|------|----------|
| **`decks`** | `format`, `commander`, `colors`, `deck_text`, `currency`, `plan`, `data` (jsonb), etc. `app/api/decks/create/route.ts` defaults `format` to `"Commander"`; commander auto-detection only when `format === "Commander"`. |
| **`deck_cards`** | Columns used in API: `id`, `deck_id`, `name`, `qty` (`app/api/decks/cards/route.ts`). **No `zone`, `is_sideboard`, or `is_commander`.** |
| **Collection** | `collection_cards` + `collection_meta` — qty-based; **not format-scoped** (format is a deck concern). |
| **Wishlist** | `wishlists` / `wishlist_items` — `name` + `qty`; **not format-scoped** (`app/api/wishlists/add/route.ts`). |
| **Format field** | Stored; updated via `POST /api/decks/[id]/format` with whitelist: `commander`, `standard`, `modern`, `pioneer`, `pauper`. |
| **Commander field** | Stored on `decks.commander`; APIs under `app/api/decks/[id]/commander/`, create/update extract commander for Commander format. |
| **Sideboard / mainboard** | **Not in DB** as zones; `parseDeckText` merges SB lines into totals; `lib/chat/decklist-normalize.ts` has conceptual mainboard for parsing elsewhere. `decks.meta.maybeFlexCards` for optional flex list (non-Commander). |
| **Quantities** | `qty` supports any positive integer — **4-of is representable**; validation is the gap, not storage. |
| **Migrations** | Under `db/migrations/`; deck shape evolved via many migrations. **No migration reviewed that adds `zone` to `deck_cards`.** (See `094_precon_decks.sql` for `precon_decks` with `format` default Commander.) |

**Answers:** Yes, deck format is stored. Commander is stored separately. Deck cards **cannot** represent main vs side in the relational model today. Quantities can represent 4-of. Migrations exist historically; **zone support would need a new migration** (out of scope for this doc).

---

## 3. UI audit (web: `app/my-decks/**`, `components/**`, `lib/deck/**`)

**Note:** Paths use the Next.js app layout (`app/my-decks/...`), not `app/(tabs)/...`.

| File | Assumption | OK behind `format === 'commander'`? | Blocks non-Commander? |
|------|------------|-----------------------------------|------------------------|
| `app/my-decks/[id]/FormatSelector.tsx` | Pills for Commander, Standard, Modern, Pioneer, Pauper only | N/A | **Yes** for Brawl/Historic/Timeless/Legacy/Vintage (not listed) |
| `app/my-decks/[id]/Client.tsx` | `SingletonViolationBanner` only if `format === 'commander'`; `ColorIdentityBanner` + `DeckOverview` only for commander | Yes | No — correctly scoped |
| `app/my-decks/[id]/CardsPane.tsx` | Color identity add validation only for `commander`; placeholder text mentions Commander | Yes | No for other formats |
| `app/my-decks/[id]/DeckAnalyzerPanel.tsx` | **`format: 'Commander'` hardcoded** in analyze POST; batch-ignored + analytics use Commander | **Should not stay as-is** | **Yes** — analysis always Commander |
| `components/FinishDeckPanel.tsx` | **`/api/deck/analyze` with `format: "Commander"`** | No | **Yes** |
| `components/FormatCardCountBanner.tsx` | 100 vs 60 by format; “Finish This Deck” button **only for `commander`** | Mostly yes | Gaps: 60-card finish path; 75 with sideboard |
| `components/SingletonViolationBanner.tsx` | Commander singleton rules (basic land + exception list) | Only rendered for Commander in `Client.tsx` | No |
| `app/my-decks/[id]/page.tsx` | Color pie: Commander uses `colors`; else counts from cards | N/A | No |
| `app/my-decks/[id]/BuildAssistantSticky.tsx` | `checkLegality` uses `intent?.format \|\| 'Commander'` | Partially | Defaults can hide true format if intent not set |
| `app/my-decks/[id]/DeckAssistant.tsx` | Rich Commander context; `fmt` state | N/A | Copy/features skew Commander |

**Search themes:** “100”, “Commander ready”, “ramp/draw/removal” — embodied in `lib/deck/deck-facts.ts`, `health-report`, `DeckOverview`, and analyze scoring — **largely Commander/60-pioneer-modern-shaped**, not 60+15.

---

## 4. Deck validation / rules audit

| Question | Answer |
|----------|--------|
| Does validation vary by format? | **Partially:** legality + bans via `mtgValidators` + `recommendation-legality.ts`; land bands and `computeBands` branch on `format` in **`app/api/deck/analyze/route.ts`** for Commander vs Modern/Pioneer; **Standard/Pauper** hit generic branches (e.g. land threshold `else` → 23) when string slips through. |
| Is 100-card Commander hardcoded? | **Yes** in `formatCompliance.ts`, `FormatCardCountBanner`, public deck publish path uses `getFormatComplianceMessage`. |
| 4-copy / 60+15 validation? | **Missing** — no duplicate-cap check for 60-card formats; no sideboard size. |
| Where should shared `formatRules` / `deckValidator` live? | **`lib/deck/`** next to `formatCompliance.ts`, `mtgValidators.ts`, with a single canonical **`normalizeDeckFormat()`** and **`getFormatRules(format)`** returning card limits, allow duplicates, sideboard size, CI rules. |

**Notable code:**

- `lib/deck/inference.ts` `detectFormat()`: if user message contains `pioneer` or **`standard`**, return value is **`Pioneer`** — conflates two formats.
- `inferDeckContext` overwrites `context.format` with `detectFormat()` — can fight explicit deck format if not careful.
- `app/api/decks/health-report/route.ts` `normalizeFactsFormat`: Standard/Pauper → **Commander** for facts, which is **misleading** for Pro health metrics.

---

## 5. AI / tools audit

| Tool | Commander assumption? | Format passed? | Sideboard? | Notes |
|------|------------------------|----------------|------------|--------|
| **Deck analyze** | Deep (profiles, baselines) | **Sometimes**; body `format` defaults Commander; **DeckAnalyzer & FinishDeckPanel force Commander** | No | Extend `inferDeckContext` types; fix UI passes |
| **Mobile analyze** | Same core `runDeckAnalyzeCore` | Request can send format; **response defaults** `"Commander"` in `app/api/mobile/deck/analyze/route.ts` | No | **Prompt/output:** pass deck format; explainer already takes `format` |
| **Roast** | Commander-centric jokes optional | **Yes** — validated list Commander/Modern/Pioneer/Standard | No | `format !== "Commander"` clears commander |
| **Mobile roast** | `stripMobileRoastForFormat` | Same VALID_FORMATS | No | **Prompt** still Commander-flavored in places |
| **Health report** | Deterministic facts use Commander/Modern/Pioneer only | From deck row | No | **Standard → Commander fact normalization** is wrong for accuracy |
| **Health suggestions** | CI block for commander/edh | `deck.format` string | No | `app/api/deck/health-suggestions/route.ts` |
| **Mulligan** | **Schema: `z.literal("commander").optional()`** for format | **Effectively Commander-only** in API | N/A | `app/api/mulligan/advice/route.ts` |
| **Deck compare AI** | Default `"Commander"` in prompt | `format` in body, title-cased label | No | `app/api/deck/compare-ai/route.ts` |
| **Mobile deck compare** | System prompt: **"Commander deck analyst"** | `formatLabel` used for legality line | No | `lib/mobile/deck-compare-mobile-prompt.ts` — **copy fix** for non-Commander |
| **Budget swaps cron** | Role text mentions ramp/removal | Global | N/A | `app/api/cron/budget-swaps-update/route.ts` |
| **Chat** | Tiered rules; singleton for Commander in some branches | Infers format; `getFormatKnowledge` | No | `app/api/chat/route.ts` |
| **Cost to finish** | Deck vs collection; not format-typed in `Client.tsx` header | N/A | N/A | Price-focused |
| **Card explain (mobile)** | — | **Minimal** | — | `app/api/mobile/card/explain/route.ts` (not deep-audited) |
| **Custom card** | — | — | — | Separate product surface |

---

## 6. API / backend notes

- **`app/api/deck/analyze/route.ts`**: `runDeckAnalyzeCore` — format typed as Commander/Modern/Pioneer; land bands, `COMMANDER_ONLY_CARDS`, commander profiles. **Pauper/Standard** need explicit handling and normalization.
- **Public publish:** `getFormatComplianceMessage` from `decks/update` path — 100 vs 60.
- **Mobile routes** wrap analyze/roast with app-safe explainer; **default Commander** when missing.
- **Price:** generally format-agnostic; no structural blocker.
- **Discover / `meta-signals`:** Commander-only aggregates (`format`, `"Commander"` in queries) — not required for 60-card deck editor but signals product focus.

---

## 7. Grep summary (compact)

**Full-repo `Select-String` match counts** (all `*.ts` / `*.tsx` under `frontend/`, PowerShell, simple substring — 2026-04-27 run, ~163s):

| Pattern | Matches |
|---------|--------:|
| `format` | 9,138 |
| `commander` | 5,423 |
| `edh` | 1,207 |
| `banned` | 445 |
| `singleton` | 205 |
| `color identity` | 176 |
| `legalities` | 129 |
| `sideboard` | 33 |

**Interpretation:** `format` and `commander` dominate; `sideboard` is rare in code (mostly parsing/helpers, not persisted zones). `color identity` reflects Commander-style validation and rules text.

**Legacy / Vintage / Timeless / Brawl / Historic / Alchemy:** appear mainly in **`userFormatToScryfallLegalityKey`** in `lib/deck/mtgValidators.ts` — **Scryfall legality**, not product format buttons or deck rows.

---

## 8. Gap list (prioritized)

### P0 — Structural

- **No mainboard/sideboard (or commander zone) in `deck_cards`.**
- **Analyze pipeline** does not support **Standard** as distinct from **Pioneer** in heuristics; health-report collapses non-triplet formats to Commander for facts.
- **Core UI (DeckAnalyzer, FinishDeckPanel)** **always sends Commander** to analyze.

### P1 — Major UX / tools

- **60+15** compliance and **4-of** legality for constructed.
- **Mulligan API** only accepts optional `"commander"` as format.
- **Mobile compare** system prompt says Commander analyst.
- **Publish compliance** total count **includes** sideboard lines as printed in flat deck text (false failures).

### P2 — Polish / copy

- Inconsistent **Title Case vs lowercase** format strings between DB, API, and `inferDeckContext`.
- **Placeholder** in `CardsPane` still optimized for “1 Card Name” Commander-style entry.

### P3 — Nice-to-haves

- Discover/meta for non-Commander formats.
- **`format-knowledge`**: already has Standard/Pauper JSON — **wire into more routes** (analyze) if not redundant with chat.
- Brawl (60-card singleton) as a first-class `decks.format` if desired.

---

## 9. Recommended implementation phases (no code in this doc)

1. **Phase 1 — Central format rules config:** Single module exporting limits (main, side, singleton vs 4-of), Scryfall key, ban-list key, CI rules; **`normalizeFormat()`** for DB/API/UI.
2. **Phase 2 — Deck card zones:** Migration + `parseDeckText` → structured zones + sync to `deck_text` export; import/export (Moxfield, etc.).
3. **Phase 3 — Shared `deckValidator`:** Enforce from rules; reuse in publish, analyze preflight, and suggestions.
4. **Phase 4 — UI conditional copy / readiness:** Pass **actual** `format` to analyze/finish; gate Commander-only panels; add constructed readiness (curve/legal/4-of) where relevant.
5. **Phase 5 — AI format-awareness:** Prompts + `inferDeckContext` **extend** format union; fix `detectFormat` Standard vs Pioneer; mobile defaults; roast/compare wording.
6. **Phase 6 — Import/export:** Sideboard sections; Arena/MTGO style.

---

## 10. Recommended first patch (smallest safe change)

**Plumb the deck’s `format` from the DB into all `/api/deck/analyze` calls that currently hardcode `Commander`:**

- `app/my-decks/[id]/DeckAnalyzerPanel.tsx` — use the `format` prop (map to the capitalized string the API expects: `Commander`, `Modern`, `Pioneer` until Standard/Pauper are added to `runDeckAnalyzeCore` types).
- `components/FinishDeckPanel.tsx` — accept `format` as a prop (from parent that already knows deck format) instead of `format: "Commander"`.

This is **low risk** (no migration), unblocks **honest** analysis for **Modern/Pioneer** immediately, and sets up **Standard/Pauper** once the analyze core normalizes those strings instead of coercing to Pioneer or defaulting to Commander.

---

*End of audit document.*
