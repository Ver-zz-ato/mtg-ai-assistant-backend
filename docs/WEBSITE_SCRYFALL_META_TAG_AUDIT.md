# Website / Backend Scryfall Meta-Tag Audit

**Scope:** `mtg_ai_assistant` (Next.js frontend / API routes) only.  
**Method:** Verified from source (March 2026). No runtime behavior was changed.  
**Note:** Many files call `.from("scryfall_cache")` for images, name fixups, prices, or admin tooling. This report focuses on **deck intelligence**, **analysis**, **health**, and **LLM grounding**.

---

## 1. Executive summary

- **Plain English:** Rich `scryfall_cache` columns (`is_land`, `is_creature`, `legalities`, `keywords`, `colors`, etc.) are **wired into hydration** (`getEnrichmentForNames`, `fetchCardsBatch`, `batch-metadata`, partial reads). The **v2 deck context path** (`buildDeckContextSummary` → `enrichDeck` → `tagCards` → `buildDeckFacts`) **does** use `is_land` / `is_creature` when the boolean columns are present, and uses **oracle text + regex** (not DB keywords) for ramp/draw/removal style **role tags**. **Deck analyze** mixes two worlds: `inferDeckContext` / curve code **respect** `is_land` via `sfIsLand`, but **`deckTally`** (used for bands and quick-fix copy) counts lands with **`type_line` substring only**. **Pro Health Report** uses **`enrichDeck` → `tagCards` → `buildDeckFacts`** in the prompt (same route); **deck compare AI** still sends **raw comparison text** with **no** `scryfall_cache` enrichment. **Prompt module detection** and **semantic fingerprint** are the main places that **actively use** DB **`keywords`** (as additive signals next to oracle).

- **Already good**
  - Single-batch enrichment for deck intelligence: `getEnrichmentForNames` selects the Phase 2A-style columns including `is_land`, `is_creature`, `legalities`, `keywords`, `colors`.
  - `inferDeckContext` land count, `tagCardRoles` land role, and curve’s “skip lands” use `sfIsLand` → prefers **`is_land`** when set.
  - `isLandForDeck` / `isCreatureForDeck` in `card-role-tags.ts` align enrichment flags with legacy `type_line` fallbacks.
  - `moduleDetection.ts` uses **`keywords`** from cache for Cascade / Storm / Landfall / Dredge alongside oracle regex.
  - `deck-semantic-fingerprint.ts` uses **`keywords`** for Flash (plus oracle) and `is_instant` / `is_sorcery` when set.

- **Still legacy / heuristic**
  - **Role tagging** (`tagCard`, `tagCardRoles`): oracle regex + **card name** substring heuristics (e.g. `signet|sol ring`, `removal` in name). **`keywords` json on `EnrichedCard` is not consulted** in `card-role-tags.ts`.
  - **`deckTally`** in `app/api/deck/analyze/route.ts`: land detection is `/land/i` on **`type_line` only** — ignores `is_land`.
  - **`buildDeckContextSummary` fallback** `tally()`: same pattern as legacy `deckTally` (type_line / oracle / name regex).
  - **`synergy-diagnostics.ts`**: nonland filter uses `(type_line).includes("land")` only — not `isLandForDeck`.
  - **`select-key-cards.ts`**: land filtering via **`type_line`** from `getDetailsForNamesCacheOnly` (no `is_land` in that select path).

- **Biggest mismatch / risk**
  - **Same product surface (deck analyze)** can show **different land and package ideas** depending on whether you trust **`inferDeckContext.landCount`** (uses `is_land`) vs **`deckTally` lands** (type_line only), and **v2 summary** (tag-based ramp/removal/draw) vs **inference role tags** (broader regex + name heuristics). **Health report** has **no deterministic grounding** from cache at all.

---

## 2. Canonical data sources

| Source | Role |
|--------|------|
| **`getEnrichmentForNames`** (`frontend/lib/server/scryfallCache.ts`) | Primary **deck intelligence** hydration: selects `name, type_line, oracle_text, color_identity, cmc, mana_cost, legalities, power, toughness, loyalty, keywords, colors, updated_at, is_land, is_creature`; API upsert via `buildScryfallCacheRowFromApiCard` on miss/stale. |
| **`fetchCardsBatch` / `fetchCard`** (`frontend/lib/deck/inference.ts`) | **Analyze route** card map: `SC_CACHE_INFERENCE_SELECT` includes type/oracle/CI/cmc/mana_cost/**legalities**/keywords/colors/P/T/loyalty/**is_\*** flags. |
| **`getDetailsForNamesCacheOnly`** (`frontend/lib/server/scryfallCache.ts`) | **Cache-only** strip: `type_line, oracle_text, keywords, is_instant, is_sorcery` — used by semantic fingerprint, key-card candidate loading (partial), `composeSystemPrompt` → `moduleDetection`. |
| **`buildDeckContextSummary`** (`frontend/lib/deck/deck-context-summary.ts`) | **Canonical v2 JSON** for chat: `enrichDeck` → `tagCards` → `buildDeckFacts` + `buildSynergyDiagnostics`; fallback to `fetchCardsBatch` + legacy `tally()` on throw. |

**Fields from `scryfall_cache` that actually drive server logic** (not just pass-through to clients):

- Always heavily used when present: **`type_line`**, **`oracle_text`**, **`color_identity`**, **`cmc`**, **`legalities`** (format checks, banned/off-color in facts).
- Used when boolean columns populated: **`is_land`**, **`is_creature`** (and in inference also **`is_instant`**, **`is_sorcery`**, **`is_planeswalker`**, etc.).
- Used in specific subsystems: **`keywords`** (`moduleDetection`, `deck-semantic-fingerprint`, exposed in `batch-metadata` / `SfCard` but **not** in `card-role-tags`).
- **Passed through** on enriched cards but **little or no logic** in deck intelligence TS: **`colors`** (card colors vs identity), **`mana_cost`** (available on `SfCard` / enrichment; role rules mostly use oracle), **`power`/`toughness`/`loyalty`** (API/metadata).

---

## 3. Usage by feature

### Deck analysis (`POST /api/deck/analyze`)

| Area | File(s) | Function(s) | Rich metadata | Heuristics |
|------|---------|---------------|---------------|------------|
| Card loading | `app/api/deck/analyze/route.ts` | `fetchCardsBatch` | **Verified:** loads full inference row from cache/API. | — |
| Context for LLM | `lib/deck/analysis-generator.ts` | `generateDeckAnalysis` | Commander grounding + key cards (separate). | **Full decklist** + format/colors/archetype string in user prompt. |
| Inference | `lib/deck/inference.ts` | `inferDeckContext`, `tagCardRoles`, `analyzeCurve`, `detectArchetype`, … | **Land/creature/planeswalker/instant** via **`sfIsLand`** / **`sfIsCreature`** / etc. when `is_*` set. | **tagCardRoles:** oracle regex + **name** patterns for ramp/draw/removal/engine/etc. |
| Quick metrics for scoring | `app/api/deck/analyze/route.ts` | `deckTally`, `computeBands` | Uses **`oracle_text`**, **`type_line`**, **`cmc`** from `SfCard`. | **Lands:** `/land/i` on **type_line only** — **does not** use `is_land`. Ramp/draw/removal: regex + name (signet/talisman/sol ring). |
| v2 summary persistence | Same route + `lib/deck/deck-context-summary.ts` | `buildDeckContextSummary` | **Yes** when enrichment succeeds: tag-based counts from **`is_land`/`is_creature`** path. | Fallback `tally()` same as legacy. |
| System prompt modules | `lib/prompts/composeSystemPrompt.ts`, `moduleDetection.ts` | `composeSystemPrompt`, `detectModules` | **`keywords`** + oracle + **type_line** for spell/instant counts. | Commander name allowlist; graveyard name set. |

**Conclusion:** Analyze **indirectly** benefits from meta-tag upgrades via `fetchCardsBatch` and v2 summary, but **`deckTally` land counts and heuristic packages remain type_line/name/oracle-based** and can **disagree** with `inferDeckContext.landCount`.

### Deck health report (`POST /api/decks/health-report`)

| File | Function | Uses `scryfall_cache`? |
|------|----------|------------------------|
| `app/api/decks/health-report/route.ts` | `POST` | **Yes** via **`enrichDeck`** (`getEnrichmentForNames`) on **`deck_cards`** (or **`parseDeckText`** fallback). Injects compact **`buildDeckFacts`** JSON into the prompt + decklist for card-level suggestions. |

**Conclusion:** Uses the same deterministic pipeline as v2 context facts for grounding; LLM interprets/explains.

### Deck facts / metrics / context summary

| File | Function | Metadata |
|------|----------|----------|
| `deck-context-summary.ts` | `buildDeckContextSummary` | Primary path: **`enrichDeck`** → facts/tags. |
| `deck-facts.ts` | `buildDeckFacts` | **Land split:** `isLandForDeck` (prefers **`is_land`**). **Legality/banned:** **`legalities`**. **CI:** **`color_identity`**. **Ramp/draw/interaction:** derived from **tags** (oracle/name rules). |
| `card-role-tags.ts` | `tagCard`, rules like `checkRamp`, `checkDraw`, `checkInteraction` | **`is_land`/`is_creature`** for land creature checks; **oracle regex**; **name** heuristics. **Does not read `keywords`.** |
| `synergy-diagnostics.ts` | `buildSynergyDiagnostics` | Tag graph from **`card-role-tags`**. **Nonland filter:** **`type_line` includes `"land"`** only (legacy). |
| `data-moat/snapshot-deck-metrics.ts` | `snapshotDeckMetricsForDeck` | Persists summary numbers + **`deck_facts`** / **`synergy_diagnostics`** JSON. |

### Chat streaming (grounding)

| File | Behavior |
|------|----------|
| `app/api/chat/stream/route.ts` | When `deck_facts` + `synergy_diagnostics` exist: injects **`formatForLLM`** / **`buildDeckPlanProfile`** prose as authoritative. Else JSON v2 block. Optional **`computeDeckSemanticFingerprint`** (cache-only). |

**Conclusion:** Chat **uses** enriched paths when summary is built; fingerprint adds **keywords + is_instant/is_sorcery** signals.

### Recommendations / compare / related

| Route | File | `scryfall_cache` usage |
|-------|------|------------------------|
| Deck recommendations | `app/api/recommendations/deck/[id]/route.ts` | `getDetailsForNamesCached` for **color identity**; ** `.select('name, legalities')`** for non-Commander legality; **images** via `small`/`normal`. Staple list is **static**, not meta-tag driven. |
| Compare AI | `app/api/deck/compare-ai/route.ts` | **No** cache reads; prompt is client-supplied **`decks`** + **`comparison`** strings. |

### Commander / legality / color

| Location | Behavior |
|----------|----------|
| `deck-facts.ts` | **`legalities[formatKey]`**, **`color_identity`** vs commander CI. |
| `deck-enrichment.ts` | **`isCommanderEligible(type_line, oracle_text)`** — text rules, not a DB flag. |
| `mtgValidators.ts` | **`isLegalForFormat`** → **`legalities`**. |
| `inference` / `fetchCard` | **`legalities`** normalized from cache row. |

---

## 4. Field-by-field usage table

| Field | Used where (verified) | Purpose | Importance | Gaps |
|-------|------------------------|---------|------------|------|
| **is_land** | `getEnrichmentForNames` → `enrichDeck`; `isLandForDeck`; `sfIsLand` in `inferDeckContext`, `tagCardRoles`, `analyzeCurve`; mulligan `isLandFromLookup` | Land vs nonland for counts, curve skip, fixing rules | **High** where wired | **`deckTally`**, **`synergy-diagnostics` nonlands**, **`select-key-cards` land skip** ignore `is_land` |
| **is_creature** | Enrichment, `isCreatureForDeck`, `sfIsCreature`, `checkRamp` / `checkFinisher` / `checkComboEngine` | Creature-based rules | **Medium** | — |
| **type_line** | Everywhere (tags, inference, moduleDetection instants/sorceries, fingerprint tribal) | Fallback when `is_*` null; commander eligibility; equipment/aura heuristics | **High** | Substring checks can disagree with flags |
| **oracle_text** | Role tags, fingerprint, moduleDetection, inference archetype, commander ramp detection | Primary text for regex classifiers | **High** | Regex maintenance burden |
| **keywords** | `moduleDetection` (Cascade, Storm, Landfall, Dredge); `deck-semantic-fingerprint` (Flash); `batch-metadata` pass-through; `SfCard` | Additive keyword detection | **Medium** in those features | **Not used** in `card-role-tags` / `deck-facts` tag pipeline |
| **legalities** | `deck-facts`, validators, recommendations route (non-Commander), enrichment | Banned + format gate | **High** | `legality_incomplete` when json missing |
| **colors** | Enrichment, `SfCard`, `batch-metadata` | Card color (≠ identity); little deck logic | **Low** in current deck TS | — |
| **color_identity** | Enrichment, facts, inference commander, validators | Identity enforcement | **High** | — |
| **cmc** | Enrichment, facts curve, inference | Curve + finisher heuristic | **High** | — |
| **mana_cost** | Selected in inference/enrichment | Available on cards; **role tagging rarely uses** | **Low** in role pipeline | `SOURCE_MANA_COST` constant in `card-role-tags.ts` is **unused** |

---

## 5. Legacy heuristic paths

| Location | Function / area | What it does | Risk | Future direction (non-binding) |
|----------|-----------------|--------------|------|--------------------------------|
| `deck-context-summary.ts` | `tally()` | `landRe.test(typeLine)`, oracle/name regex for ramp/draw/removal | Miscount if enrichment fails | Prefer single code path with `sfIsLand` / tags |
| `deck-context-summary.ts` | `inferWarningFlags`, commander-name **archetype** regex | Thresholds + name pattern archetype tags | Rough UX signals | Could use `deck_facts` only when present |
| `app/api/deck/analyze/route.ts` | `deckTally` | **Land = type_line “land”**; same regex stack as legacy tally | **Divergence** from `inferDeckContext.landCount` | Align with `sfIsLand` or tag pipeline |
| `lib/deck/inference.ts` | `tagCardRoles` | Broad oracle + **name** heuristics (`removal` in name, etc.) | False positives/negatives | Tighten rules or share `tagCard` logic |
| `lib/deck/card-role-tags.ts` | `checkRamp`, `checkFixing`, etc. | Oracle regex + **name** lists (duals/fetch, signets) | Heuristic drift | Optional: incorporate `keywords` / DB flags |
| `lib/deck/inference.ts` | `detectArchetype`, tribal checks | **Name** includes tribe + oracle | False tribal | — |
| `lib/deck/select-key-cards.ts` | `filterGroundingCandidates` | Land = **`type_line`** `\bland\b`; name fallback for basics | MDFC / flag mismatch | Pass `is_land` into cache-only fetch or reuse `isLandForDeck` |
| `lib/deck/synergy-diagnostics.ts` | `buildSynergyDiagnostics` | **`type_line` “land”** for nonlands | Inconsistent with `is_land` | Use `isLandForDeck` |
| `app/api/decks/health-report/route.ts` | `POST` | **Facts JSON + decklist** to LLM | Tag/regex drift; `interaction_count` double-count | — |
| `app/api/deck/compare-ai/route.ts` | `POST` | **Raw** comparison text | No cache grounding | Optional structured diff + facts |
| `lib/deck/analysis-generator.ts` | `generateDeckAnalysis` | Full **decklist** in prompt | Model ignores structure | Already has key-card grounding; could add v2 facts |

---

## 6. Recommended canonical approach (based on current code)

1. **Hydration:** Keep **`getEnrichmentForNames`** + **`fetchCardsBatch`** as the **authoritative** way to load `scryfall_cache` rows for server features (already shared normalization via `normalizeScryfallCacheName` / `norm`).

2. **Land detection:** Treat **`is_land` (when boolean)** + **`type_line` fallback** as the **intended** pattern (`sfIsLand`, `isLandForDeck`). **Canonicalize** call sites still using raw **`type_line.includes("land")`** only (`deckTally`, `synergy-diagnostics`, key-card filter).

3. **Ramp / draw / removal / interaction tagging:** Today’s **canonical “rich” path for chat/v2** is **`card-role-tags.ts`** (oracle regex + small name heuristics), **not** DB `keywords` (except parallel systems). **`inferDeckContext` `tagCardRoles`** is a **second parallel** classifier for analyze — expect **conceptual drift** until unified.

4. **Legality / color identity:** **`legalities` jsonb** + **`color_identity`** + **`isLegalForFormat` / `buildDeckFacts`** are the **strongest** deterministic checks in code.

5. **Health / facts for product narrative:** **`buildDeckFacts` + `DeckContextSummary`** (and DB `deck_context_summary`) are the **closest thing** to a single **deterministic deck intelligence** artifact for LLM grounding today.

6. **AI grounding:** For chat, **“AUTHORITATIVE”** block from **`intelligence-formatter`** + **`deck-plan-profile`** when v2 summary is present. **Health report** and **compare-ai** are **not** on that path.

---

## 7. Actionable next steps (prioritized — no code in this pass)

| Priority | Item |
|----------|------|
| **Keep as-is** | `getEnrichmentForNames` select list; `sfIsLand` in inference; v2 summary primary path; `moduleDetection` keyword augmentation; semantic fingerprint. |
| **Needs follow-up** | Align **`deckTally`** (and any UX copy driven from it) with **`sfIsLand`** or shared helper; align **`synergy-diagnostics`** and **key-card** land filtering with **`is_land`**; reduce duplication between **`tagCardRoles`** and **`tagCard`**. |
| **Optional improvement** | Inject **compact facts** (or full **`buildDeckContextSummary`**) into **compare-ai** prompts; use **`keywords`** inside **`card-role-tags`** for abilities already on oracle keyword list (Flash, Landfall, etc.) to reduce regex drift. |

---

## Appendix A — `.from("scryfall_cache")` read sites (representative)

**Deck / intelligence adjacent:**  
`frontend/lib/server/scryfallCache.ts`, `frontend/lib/deck/inference.ts`, `frontend/app/api/cards/batch-metadata/route.ts`, `frontend/lib/mulligan/card-types.ts`, `frontend/app/api/recommendations/deck/[id]/route.ts`, `frontend/lib/ai/deck-semantic-fingerprint.ts` (via cache-only helper), `frontend/lib/prompts/composeSystemPrompt.ts`.

**Other reads (lower relevance to this audit):** e.g. `recognize-image`, `shopping-list`, fuzzy/fix-names routes, `normalizeCardNames`, crons, admin, OG image, price tooling — still hit `scryfall_cache` but not analyzed line-by-line here.

---

## Appendix B — Uncertainty / not fully traced

- **Dynamic behavior** across stale-cache + API upsert branches (exact row shape after Scryfall collection response) — logic is in code but edge cases depend on live API.
- **All** UI paths that call `batch-metadata` vs inline Supabase — mobile/clients may use enriched fields differently; this audit is **website/backend** only.
- **Interaction double-counting** in `buildDeckFacts`: a card with both `counterspell` and `spot_removal` increments **`interaction_count`** twice — verified in `deck-facts.ts` loop; impact on thresholds not user-tested here.
