# Generate Constructed — Implementation Report

## Executive summary

Delivered an **additive** ManaTap feature: **`POST /api/deck/generate-constructed`** builds **Modern / Pioneer / Standard / Pauper** decks with a **60-card mainboard + 15-card sideboard** mindset, separate prompts from Commander, **legality filtering** via existing **`filterDecklistQtyRowsForFormat`**, **best-effort pricing** from **`price_cache`**, and **`ai_usage`** logging (`deck_generate_constructed`). The mobile app adds **`build-constructed-ai`** and links from **Build a Deck** for 60-card formats.

**Commander** **`/api/deck/generate-from-collection`** was **not** modified.

## Files changed

### Backend (`mtg_ai_assistant/frontend`)

| File | Role |
|------|------|
| `app/api/deck/generate-constructed/route.ts` | New route |
| `lib/prompts/generate-constructed.ts` | Constructed-only prompts |
| `lib/feature-limits.ts` | `GENERATE_CONSTRUCTED_GUEST`, `_FREE`, `_PRO` |
| `CHANGELOG.md` | Entry for this feature |

### Mobile (`Manatap-APP`)

| File | Role |
|------|------|
| `app/(tabs)/decks/build-constructed-ai.tsx` | Wizard + result + save |
| `app/(tabs)/decks/build.tsx` | Navigation rows to constructed AI |
| `src/api/decks.ts` | `generateConstructedDeck` |
| `src/api/deckGeneration.types.ts` | Request/response types |
| `src/lib/ai-api-attribution.ts` | `buildConstructedAi` source page |
| `CHANGELOG.md` | Entry |

## API contract

**`POST /api/deck/generate-constructed`**

**Body (JSON):**

- `format`: `"Modern" \| "Pioneer" \| "Standard" \| "Pauper"` (required)
- `colors?`: `string[]` — mana symbols `W,U,B,R,G`
- `archetype?`, `budget?`: `budget` \| `balanced` \| `premium`
- `powerLevel?`: `casual` \| `strong` \| `competitive`
- `ownedCards?`: `string[]`
- `notes?`: `string`

**Success (`200`):**  
`ok: true`, `format`, `title`, `colors`, `archetype`, `deckText`, `mainboardCount`, `sideboardCount`, `estimatedPriceUsd`, `explanation[]`, `metaScore`, `confidence`, `warnings[]`.

**Failure:**  
- Validation: `400` with `{ ok: false, error: "validation_error", details }`  
- Generation: `{ ok: false, error: "GENERATION_FAILED" }` with **`502`** when model output or post-validation fails  
- Rate limit / budget / maintenance: same patterns as other AI routes.

## Test results

| Check | Status |
|--------|--------|
| `npm run build` (frontend) | Passed during implementation |
| `npx tsc --noEmit` (Manatap-APP) | Passed |

**Manual / live matrix** (run after deploy with real `OPENAI_API_KEY` and data):

1. Modern Rakdos Midrange-style prompt  
2. Pioneer Mono Green  
3. Standard Azorius Control  
4. Pauper Burn  
5. Budget Modern Aggro  
6. Omit `colors`  
7. Invalid `format` → **400**  
8. Omit `archetype` → allowed (optional)  
9. Include `ownedCards`  

Verify: ~60 main, ~15 side after filtering; no Commander-flavored copy in prompts; JSON valid; cards legal for format.

## Prices accuracy

**Estimated USD** sums **`usd_price` × qty** from **`price_cache`** when rows exist. Missing prices contribute **0**; **`estimatedPriceUsd`** may be **0** — requests do **not** fail.

## Known limitations

- Copy limits (**4-of** non-basics) are **prompt-level** only; no strict post-validation of duplicate rules beyond legality.
- **Guest** daily cap is **1** (`GENERATE_CONSTRUCTED_GUEST`); **free** signed-in users **1/day**; **Pro** **25/day** — tune in **`feature-limits.ts`** if product changes.
- Model tier follows **`getModelForTier`** (**`deck_analysis`**); not hard-coded to **`gpt-4o-mini`** for free users if env overrides differ.

## Recommended Phase 2 upgrades

- Meta/archetype hints from external snapshots (e.g. trending shells).
- Stronger **duplicate / deck-size** repair loop after legality filter.
- **Sideboard guide** prose (matchup bullets) as optional JSON fields.
- **`POST /api/deck/generate` wrapper** delegating Commander vs constructed (per architecture note), once clients migrate.
