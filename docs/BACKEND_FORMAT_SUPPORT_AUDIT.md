# Backend format support audit — deck tools & APIs

**Repo:** `mtg_ai_assistant`  
**Date:** 2026-04-27  
**Scope:** Read-only audit (sources: Next.js `frontend/app/api/**`, shared `frontend/lib/deck/**`). External upstream services invoked by proxies are **not** verified here unless referenced in-repo.

## Executive summary

- **Canonical format lists differ by layer.** `lib/deck/formatRules.ts` exposes analysis/deck-builder canonical formats as **Commander, Modern, Pioneer, Standard, Pauper** only. Unknown DB/API strings fall through **`deckFormatStringToAnalyzeFormat`** → **defaults to Commander**.
- **`userFormatToScryfallLegalityKey`** in `mtgValidators.ts` supports **additional** Scryfall keys (legacy, vintage, brawl, historic, etc.) for **legality checks** when the upstream format **string** matches—but **`deckFormatStringToAnalyzeFormat`** never maps those to distinct **`AnalyzeFormat`** values; they still collapse through **`normalizeDeckFormat`** → null → **Commander** for analyze/heuristics.
- **`/api/collections/cost-to-finish`** (Next proxy) **does not forward `format`** in the JSON payload to upstream; **`format` sent by clients is ignored at this boundary.** Local fallback **`/api/collections/cost`** also ignores **`format`** and uses **`parseDeckText`** (flat merge), not **`parseDeckTextWithZones`**, so **Mainboard/Sideboard section zoning is not honored** on that path.
- **Deck analyze** (`/api/deck/analyze`, used by **`/api/mobile/deck/analyze`**) **does** use **`body.format`** and **`decks.format`**, **`parseMainboardEntriesForAnalysis`**, bans + **`evaluateCardRecommendationLegality`** (Scryfall cache **`legalities`** + curated bans)—strong **partial** multi-format support within the five canonical **`AnalyzeFormat`** values.
- **Roasts** (`/api/deck/roast`, `/api/mobile/deck/roast-ai`) accept **`format`** but **`VALID_FORMATS`** = Commander, Modern, Pioneer, Standard only (**no Pauper** on roast routes).
- **Mulligan** (`/api/mulligan/advice`) schema allows **`format: "commander"`** only; handler **forces** **`format: "commander"`**—explicit **Commander-only** API behavior.

---

## Route-by-route table

| Route | Accepts `format`? | Uses `format`? | Format source | Commander assumptions? | Main/Side parse? | Risk |
|-------|-------------------|----------------|---------------|------------------------|------------------|------|
| `POST /api/collections/cost-to-finish` | Client may send; **proxy strips it** | **No** (not in forwarded payload) | N/A at proxy | No | **Not on proxy.** Depends on upstream; local fallback below | **Unknown** upstream; **Partial** if hits `/api/collections/cost` |
| `POST /api/collections/cost` | Not read | No | N/A | No | **`parseDeckText`** — zones **not** split | **Partial** |
| `POST /api/deck/analyze` | Yes (`body.format`) | Yes | **`body.format` ∪ `decks.format`** | Branches on **`AnalyzeFormat === "Commander"`** | **`parseMainboardEntriesForAnalysis`** uses **`parseDeckTextWithZones`** for non-Commander | **OK** (within 5 canonical formats) |
| `POST /api/mobile/deck/analyze` | Passed through to core | Same as analyze | Request + DB | Same | Same | **OK** |
| `POST /api/deck/roast` | Yes | Yes (prompt + commander resolution) | Body, default Commander | Commander extraction when format is Commander | **`parseDeckText`** only | **Partial** (allowed formats subset; flat parse) |
| `POST /api/mobile/deck/roast-ai` | Yes | Yes | Body | Same | **`prepareDeckCardsForRoast`** | **Partial** |
| `POST /api/mobile/deck/compare-ai` | Yes (`format` / `deckFormat`) | Yes (prompt casing) | Body, default Commander | Prompt text only | **`decks` string** — no deck parser | **Partial** |
| `POST /api/deck/swap-suggestions` | Yes | Partial | Body, default Commander | CI only if “commander/edh” in format string | **`parseDeckText`** | **Partial** |
| `POST /api/decks/health-report` | Via **`decks.format`** row | Yes | **DB `decks.format`** → **`deckFormatStringToAnalyzeFormat`** | Prompt branches Commander vs constructed | **`deck_cards`** main-only merge; else **`parseDeckText`** | **Partial** |
| `POST /api/mulligan/advice` | Optional **`commander` only** in schema | **Overridden to commander** | Hardcoded | **Yes** | Client-supplied deck counts | **Commander-only** |
| `POST /api/deck/generate-from-collection` | Yes (`normalizeGenerationBody`) | Yes | Body | Commander-centric generation | N/A | **Commander-focused** |
| `POST /api/deck/transform` | Via shared generation/transform inputs | Yes | Body | Same family as generate | N/A | **Commander-focused** |

---

## Specific findings (paths & behavior)

### `POST /api/collections/cost-to-finish`

**File:** `frontend/app/api/collections/cost-to-finish/route.ts`

- Builds **`payload`** with: `deckId`, `collectionId`, `deckText`, `currency`, `useOwned`, `useSnapshot`, `snapshotDate` — **`format` is omitted**, so mobile/clients sending **`format`** have it **ignored** here.
- Proxies to **`/api/collections/cost`** (local) or external **`BACKEND_ORIGIN`** candidates.

**Answer focus Q8:**

| Question | In-repo answer |
|----------|------------------|
| Accept `format`? | **Not forwarded** by proxy. |
| Use `format`? | **No** at this layer. |
| Parse Mainboard/Sideboard? | **Local `/api/collections/cost`** uses **`parseDeckText`** → headers skipped; **`SB:`** lines stripped but cards aggregate into **one pool** (no zone split). |
| Reload **`deck_cards`** by **`deckId`? | **`/api/collections/cost`** loads **`decks.deck_text`** only when **`deckText`** missing — **does not** load **`deck_cards`**. |
| Meaning of **`need`** on **`/api/collections/cost`** | **`need = max(0, qty_in_deck_parse − owned_in_collection)`** per card — **missing-from-collection** for decklist completion cost, **not** AI “suggested extra copy” semantics. |

### `POST /api/collections/cost`

**File:** `frontend/app/api/collections/cost/route.ts`

- No **`format`** field.
- **`wantQtyByCanonKey`** uses **`parseDeckLines`** = **`parseDeckText`** (flat).

### `POST /api/deck/analyze` (core: `runDeckAnalyzeCore`)

**File:** `frontend/app/api/deck/analyze/route.ts` (large)

- Loads **`decks.deck_text, commander, format, colors`** when **`deckId`** present; merges **`body.format`** with **`deckRow.format`**.
- **`deckFormatStringToAnalyzeFormat`** → **`AnalyzeFormat`** (Commander | Modern | Pioneer | Standard | Pauper); **unknown string → Commander**.
- **`parseMainboardEntriesForAnalysis(deckText, format)`** — non-Commander uses **`parseDeckTextWithZones`** and **excludes sideboard** (`frontend/lib/deck/formatCompliance.ts`).
- **Legality:** **`evaluateCardRecommendationLegality`** + **`getBannedCards`** / ban maps; uses **Scryfall `legalities`** via **`userFormatToScryfallLegalityKey`** where applicable (`frontend/lib/deck/recommendation-legality.ts`, **`mtgValidators`**).

### `POST /api/mobile/deck/analyze`

**File:** `frontend/app/api/mobile/deck/analyze/route.ts`

- Reads **`format`** from body for **`generateAppSafeDeckExplanation`**; **`runDeckAnalyzeCore`** receives **`parsedBody`** — core analyze behavior matches **`/api/deck/analyze`**.

### `POST /api/deck/roast` / `POST /api/mobile/deck/roast-ai`

**Files:** `frontend/app/api/deck/roast/route.ts`, `frontend/app/api/mobile/deck/roast-ai/route.ts`

- **`VALID_FORMATS`** = `["Commander", "Modern", "Pioneer", "Standard"]` — **Pauper/Legacy/Vintage/Brawl rejected** with 400.
- Non-Commander: **`commander`** cleared; prompts include **`format`** (mobile also **`stripMobileRoastForFormat`**).

### `POST /api/mobile/deck/compare-ai`

**File:** `frontend/app/api/mobile/deck/compare-ai/route.ts`

- **`formatRaw`** from **`body.format`** / **`body.deckFormat`**, default Commander; used for **prompt** (`buildMobileDeckCompareSystemPrompt`). No deck-text zoning parser in snippet.

### `POST /api/deck/swap-suggestions`

**File:** `frontend/app/api/deck/swap-suggestions/route.ts`

- **`format`** default **`Commander`**; **`isCommanderFormat`** = format string includes **`commander`** or **`edh`** → enables commander color identity for AI path.
- **`parseDeck`** uses **`parseDeckText`** only.

### `POST /api/decks/health-report`

**File:** `frontend/app/api/decks/health-report/route.ts`

- **`deck.format`** from DB → **`normalizeFactsFormat`** → **`deckFormatStringToAnalyzeFormat`**.
- Prefers **`deck_cards`** (mainboard rows excluding sideboard in **`deckEntriesFromDeckCards`**); falls back to **`parseDeckText(deck.deck_text)`**.
- Prompt distinguishes Commander vs **60-card constructed** advice.

### `POST /api/mulligan/advice`

**File:** `frontend/app/api/mulligan/advice/route.ts`

- Zod allows **`format: z.literal("commander").optional()`**; handler sets **`format: "commander"`** unconditionally.

### Format normalization limits

**File:** `frontend/lib/deck/formatRules.ts`

- **`normalizeDeckFormat`** returns canonical keys only for **commander, modern, pioneer, standard, pauper** — **not** legacy, vintage, brawl as canonical **`DeckFormatCanonical`**.
- **`deckFormatStringToAnalyzeFormat`**: unknown → **Commander**.

**Broader Scryfall keys**

**File:** `frontend/lib/deck/mtgValidators.ts` — **`userFormatToScryfallLegalityKey`** maps legacy, vintage, brawl, etc., for **card legalities** when recommendation/analysis receives **those format strings** in **`evaluateCardRecommendationLegality`** paths—but **`AnalyzeFormat`** typing and **`deckFormatStringToAnalyzeFormat`** still collapse unknown deck formats to **Commander** for **deck metrics / slot planning**.

---

## Mobile app: `format` unused server-side

- **`POST /api/collections/cost-to-finish`** — **`format`** is **not** included in the proxy **`payload`** to upstream (`cost-to-finish/route.ts`). Clients sending **`format`** today have **no effect** at this boundary.

---

## Recommendation label

| Option | When |
|--------|------|
| **A) No backend change needed** | Only client copy/labels (already partly addressed in Manatap-APP). |
| **B) Prompt/copy-only issue** | Roasts/compare where **`VALID_FORMATS`** / prompts omit Pauper but product expects it — expand allowlist + prompts. |
| **C) Backend contract** | **`cost-to-finish`** rows should expose **`kind`**, **`inDeckQty`**, **`targetQty`**, **`reason`** if AI/upstream suggests **additional copies** vs **net-new** — requires upstream + proxy to preserve fields (not present in current proxy normalization). |
| **D) Parser bug likely** | **`/api/collections/cost`** using **`parseDeckText`** for constructed lists with **Mainboard/Sideboard** sections — zoning wrong vs **`parseDeckTextWithZones`** (partial mitigation exists in analyze path only). |

---

## Risk legend used in table

- **OK** — Explicit multi-format handling within supported **`AnalyzeFormat`** set.
- **Partial** — Accepts or infers format but flat parsers, subset allowlists, or defaults weaken correctness.
- **Commander-only** — Hardcoded or schema-enforced Commander behavior.
- **Unknown** — Depends on out-of-repo upstream **`cost-to-finish`** implementation when **`NEXT_PUBLIC_BACKEND_COST_URL`** / **`BACKEND_ORIGIN`** wins.

---

## Files referenced

| Area | Path |
|------|------|
| Cost proxy | `frontend/app/api/collections/cost-to-finish/route.ts` |
| Local cost | `frontend/app/api/collections/cost/route.ts` |
| Analyze | `frontend/app/api/deck/analyze/route.ts` |
| Mobile analyze | `frontend/app/api/mobile/deck/analyze/route.ts` |
| Roast | `frontend/app/api/deck/roast/route.ts` |
| Mobile roast | `frontend/app/api/mobile/deck/roast-ai/route.ts` |
| Compare AI | `frontend/app/api/mobile/deck/compare-ai/route.ts` |
| Swap suggestions | `frontend/app/api/deck/swap-suggestions/route.ts` |
| Health report | `frontend/app/api/decks/health-report/route.ts` |
| Mulligan | `frontend/app/api/mulligan/advice/route.ts` |
| Generate | `frontend/app/api/deck/generate-from-collection/route.ts` |
| Format rules | `frontend/lib/deck/formatRules.ts` |
| Mainboard parse | `frontend/lib/deck/formatCompliance.ts`, `frontend/lib/deck/parseDeckText.ts` |
| Legality | `frontend/lib/deck/recommendation-legality.ts`, `frontend/lib/deck/mtgValidators.ts` |
