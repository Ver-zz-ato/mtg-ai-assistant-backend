# AI Test Suite — Full Breakdown for LLM Rework

This document provides a complete technical breakdown of the AI test suite for an LLM to use when reworking or extending the system.

---

## 1. Architecture Overview

### 1.1 High-Level Flow

```
[Test Cases] → [Run/Batch API] → [Chat or Deck Analyze API] → [Response] → [Validator] → [Results]
     ↑                ↑                      ↑                    ↑
  JSON + DB      forceModel:           Uses production         ~15 check types
  merged         gpt-4o-mini           prompt system
```

### 1.2 Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Admin UI | `frontend/app/admin/ai-test/page.tsx` | Single run, batch run, validation options, prompt inspector, coverage, trends, schedules |
| Single Run API | `frontend/app/api/admin/ai-test/run/route.ts` | Runs one test via `/api/chat` or `/api/deck/analyze` |
| Batch API | `frontend/app/api/admin/ai-test/batch/route.ts` | Runs many tests with concurrency 8, creates eval_runs, writes ai_test_results |
| Validator | `frontend/lib/ai/test-validator.ts` | ~2800 lines, orchestrates all validation checks |
| Test Case CRUD | `frontend/app/api/admin/ai-test/cases/route.ts` | Merges JSON + DB sources |
| Quality API | `frontend/app/api/admin/ai-test/quality/route.ts` | Quality score formula, catch_count, failure_rate |
| Cron | `frontend/app/api/cron/ai-test-run/route.ts` | Scheduled runs via ai_test_schedules |

---

## 2. Cost & Usage

### 2.1 Model Used

- **Primary model:** `process.env.MODEL_AI_TEST || 'gpt-4o-mini'`
- Set via env var `MODEL_AI_TEST`; defaults to `gpt-4o-mini`
- Used for both main test execution (chat/deck_analysis) and LLM fact-check validation

### 2.2 Cost Tracking

- **No explicit cost tracking** in the AI test suite itself
- Production AI calls write to `ai_usage` (tokens, cost_usd, cost_usd_corrected, model, route, etc.)
- Test runs go through `/api/chat` and `/api/deck/analyze`, so they **do** create `ai_usage` rows
- No aggregation or reporting of test-specific costs in the admin UI

### 2.3 Cost Drivers

1. **Main test execution:** 1 LLM call per test (chat or deck_analysis)
2. **LLM fact-check (optional):** 1 extra `gpt-4o-mini` call per test when `runLLMFactCheck: true`
3. **Semantic similarity (optional):** 1 embedding call per test when `runSemanticCheck: true` and `expectedAnswer` is set

### 2.4 Rough Cost Estimate (gpt-4o-mini)

- ~$0.15 / 1M input, ~$0.60 / 1M output
- Per test: ~2–5K input + ~500–2K output → ~$0.001–0.003 per test
- Batch of 50 tests: ~$0.05–0.15 (without LLM fact-check)
- With LLM fact-check on: roughly 2× (extra judge call per test)

---

## 3. Implementation Details

### 3.1 Test Types

| Type | API Used | Input Shape | Output Shape |
|------|----------|-------------|--------------|
| `chat` | `/api/chat` | `{ userMessage, format?, context?, teaching? }` | `{ text }` |
| `deck_analysis` | `/api/deck/analyze` | `{ deckText, userMessage?, format, commander?, colors?, context? }` | `{ suggestions, whatsGood, quickFixes }` → concatenated text |

### 3.2 Test Case Sources

- **JSON:** `frontend/lib/data/ai_test_cases.json` — `{ testCases: [] }` (often empty; seed data in migrations)
- **DB:** `ai_test_cases` table
- **Merge:** Cases API returns `[...jsonCases, ...dbCases]`; DB cases take precedence for IDs

### 3.3 Batch Execution

- **Concurrency:** 8 tests in parallel
- **Thread reuse:** Single "Batch Test Thread" for all chat tests (avoids 30-thread limit)
- **Flow:**
  1. Create `eval_runs` row (suite name, prompt_version_id, status: running)
  2. For each test: run API → validate → insert `ai_test_results` → POST to quality API
  3. Update `eval_runs` with pass/fail counts, status: complete

### 3.4 Validation Options (Batch & Single)

```ts
{
  runKeywordChecks: true,      // Default ON
  runLLMFactCheck: true,       // Default ON — extra LLM call
  runReferenceCompare: true,   // Default ON — scryfall_cache, banned_cards
  runSemanticCheck: false,     // Default OFF — needs expectedAnswer
  runAdvancedJudges: true,     // Default ON — deck style, synergy, etc.
}
```

---

## 4. Validation Checks (Full List)

### 4.1 Keyword Checks (`validateKeywords`)

- **shouldContain:** Flexible keyword matching with synonym groups (`KEYWORD_SYNONYMS`), phrase similarity, numeric range tolerance
- **shouldNotContain:** Regex on normalized text
- **shouldMentionCard / shouldNotMentionCard:** Card name presence
- **minLength / maxLength**
- **formatSpecific:** Must mention format keywords

**Threshold:** 80% of checks must pass

### 4.2 LLM Fact-Check (`validateLLMFactCheck`)

- Model: `gpt-4o-mini`
- Output: JSON with `overall_score`, `factual_score`, `legality_score`, `synergy_score`, `pedagogy_score`, `issues`, `improved_answer`, `suggested_prompt_patch`
- Pass threshold: `overall_score >= 70`

### 4.3 Reference Compare (`validateReferenceCompare`)

- Extracts card names from response (`**Card**`, `[[Card]]`, plain text)
- For each card (up to 30):
  - **Color identity:** `scryfall_cache` — all colors in identity must be in deck colors
  - **Format legality:** `banned_cards.json`, Commander-only list
- Pass: `score >= 80` and `criticalViolations === 0`

### 4.4 Semantic Similarity (`validateSemanticSimilarity`)

- Uses `text-embedding-3-small`
- Cosine similarity between response and `expectedAnswer`
- Pass: `similarity >= 0.7`

### 4.5 MTG Heuristics (`validateMTGHeuristics`)

- Uses `mtg-heuristics` module
- Validates numeric advice (lands, ramp, etc.) against format/archetype

### 4.6 Context Relevance (`validateContextRelevance`)

- Commander mention
- Theme-specific keywords (e.g. landfall, aristocrats)
- Penalizes generic filler

### 4.7 Card Role (`validateCardRoles`)

- E.g. Altar of Dementia must not be suggested as ramp

### 4.8 Advanced Judges (deck_analysis focused)

| Judge | Function | Purpose |
|-------|----------|---------|
| Deck Style & Plan | `validateDeckStyleAndPlan` | First 1–2 sentences identify archetype/plan |
| Problems First | `validateProblemsFirstStructure` | Problems before solutions |
| Synergy | `validateSynergy` | 2+ cards with causal/enable language |
| Consistency | `validateConsistency` | Numeric ranges vs examples |
| Budget Awareness | `validateBudgetAwareness` | Budget language when user mentions it |
| Tone | `validateTone` | Casual vs competitive match |
| Specificity | `validateSpecificity` | Min card names by response length |
| Color Identity & Legality | `validateColorIdentityAndLegality` | When `requireLegalIdentity` |

### 4.9 Safety Checks (`validateSafetyChecks`)

When `expectedChecks` includes:

- `requireNoHallucinatedCards` — cards must exist in scryfall_cache
- `requireColorIdentitySafe` — color identity check
- `requirePermanentsOnly` — all cards must be permanents
- `minTribalDensity` — tribe % in deck
- `maxTotalCards` / `minTotalCards` — deck size
- `mustNotRecommendExcessiveLands` / `maxRecommendedLandsToAdd`

### 4.10 Overall Score

- Average of all run checks
- Pass: `overallScore >= 70`

---

## 5. Efficiency

### 5.1 Concurrency

- Batch: 8 concurrent tests
- Implemented as sequential batches of 8 via `Promise.all`

### 5.2 Thread Reuse

- Chat tests reuse one "Batch Test Thread" per batch to avoid thread limit

### 5.3 No Caching

- No response caching; each run hits the LLM

### 5.4 Validation Cost

- Keyword, context, structure judges: CPU-only
- LLM fact-check: +1 call per test when enabled
- Semantic: +1 embedding call per test when enabled
- Reference compare: DB reads (scryfall_cache, no external API)

---

## 6. Prompts: How They Work & How to Edit

### 6.1 Two Prompt Systems

| System | Used By | Source |
|--------|---------|--------|
| **prompt_versions** | Chat, deck_analysis (production) | `app_config.active_prompt_version_{kind}` → `prompt_versions` |
| **prompt_layers** | Deck analysis (3-layer compose) | `composeSystemPrompt` |

### 6.2 Prompt Versions (Chat / Deck Analysis)

- **Table:** `prompt_versions` (id, version, system_prompt, kind, created_at)
- **Active:** `app_config` key `active_prompt_version_chat` / `active_prompt_version_deck_analysis`
- **Fallback:** Latest version by kind, then `app_config.prompts.templates.system`
- **Config:** `frontend/lib/config/prompts.ts` — `getPromptVersion(kind)`

### 6.3 Prompt Layers (3-Layer System)

- **Table:** `prompt_layers` (key, body, meta, updated_at)
- **Composition:** `composeSystemPrompt` in `frontend/lib/prompts/composeSystemPrompt.ts`

**Layers:**

1. **BASE_UNIVERSAL_ENFORCEMENT** — Always included
2. **FORMAT_{key}** — e.g. FORMAT_COMMANDER, FORMAT_STANDARD, FORMAT_MODERN, FORMAT_PIONEER, FORMAT_PAUPER
3. **MODULE_*** — Conditionally attached by `detectModules` (deck cards, commander)
   - MODULE_CASCADE, MODULE_ARISTOCRATS, MODULE_LANDFALL, MODULE_SPELLSLINGER_STORM, MODULE_GRAVEYARD_RECURSION
4. **DECK_ANALYSIS_EXEMPLARS** — Only when `kind === 'deck_analysis'`

### 6.4 How to Edit Prompts

**Option A: Prompt versions (chat/deck_analysis)**

- Create new row in `prompt_versions`
- Set `app_config.active_prompt_version_{kind}` to new id
- Or use admin UI prompt version selector

**Option B: Prompt layers**

- Admin UI: `/admin/ai-test` → "Prompt Layers" section
- API: `GET/PUT /api/admin/prompt-layers?key=BASE_UNIVERSAL_ENFORCEMENT`
- Versions: `prompt_layer_versions` stores history

**Option C: Composed preview**

- `GET /api/admin/ai-test/composed-prompt?formatKey=commander` — preview full composed prompt

### 6.5 Apply Improvements Flow

- `prompt_patches` table stores suggested improvements from LLM judge
- `POST /api/admin/ai-test/apply-improvements` — applies selected patches to prompt (append/prepend/replace)

---

## 7. Database Schema

### 7.1 ai_test_cases

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | |
| type | text | 'chat' \| 'deck_analysis' |
| input | jsonb | Test input |
| expected_checks | jsonb | Validation config |
| tags | text[] | |
| source | text | curated, user_submitted, knowledge_gap, feedback, pdf_import_2025 |
| quality_score | numeric | Formula below |
| failure_rate | numeric | |
| last_passed_at | timestamptz | |
| catch_count | int | Bugs caught |
| consistency_score | numeric | 0–100 |
| run_count | int | |
| pass_count | int | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Quality score formula:** `(catch_count * 10) + (recent_pass_rate * 50) - (flakiness * 20)` clamped 0–1000, where `flakiness = 100 - consistency_score`

### 7.2 ai_test_results

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| test_case_id | uuid | FK |
| eval_run_id | uuid | FK |
| prompt_version_id | uuid | |
| response_text | text | |
| prompt_used | jsonb | |
| validation_results | jsonb | Full validator output |

### 7.3 eval_runs

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| suite | text | Batch name |
| prompts | uuid[] | prompt_version_ids |
| status | text | running, complete |
| meta | jsonb | test_count, pass_count, fail_count, pass_rate, prompt_kind, validation_options |
| created_at | timestamptz | |

### 7.4 ai_test_schedules

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | |
| description | text | |
| frequency | text | daily, weekly, custom |
| cron_expression | text | For custom |
| test_case_ids | uuid[] | Or null = all |
| validation_options | jsonb | |
| alert_threshold | numeric | Default 70 |
| alert_email | text | |
| enabled | boolean | |
| last_run_at | timestamptz | |
| next_run_at | timestamptz | |

### 7.5 prompt_layers

| Column | Type | Notes |
|--------|------|-------|
| key | text | PK (e.g. BASE_UNIVERSAL_ENFORCEMENT) |
| body | text | |
| meta | jsonb | |
| updated_at | timestamptz | |

### 7.6 prompt_layer_versions

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| layer_key | text | |
| body | text | |
| meta | jsonb | |
| created_at | timestamptz | |

---

## 8. Admin UI Features

### 8.1 Main Sections

- **Test cases list** — Filter by tag, type, status; search; sort by quality
- **Single run** — Select case, run, view response + validation
- **Batch run** — Select cases or "Run All", validation toggles, suite name
- **Validation options** — runKeywordChecks, runLLMFactCheck, runReferenceCompare, runSemanticCheck
- **Prompt Inspector** — Current prompt text, versions, manual replacement
- **Prompt Layers** — Edit BASE, FORMAT_*, MODULE_*; composed preview
- **Coverage** — Tag coverage, pass/fail by tag
- **Trends** — Pass rate over time (30 days)
- **Schedules** — Create/edit cron schedules
- **Eval runs** — History, compare runs (A vs B)
- **Quality** — Update scores, view high-value / low-value tests
- **Import/Export** — JSON import, PDF import, export training data
- **Generate from failures** — Create test cases from failed runs
- **Apply improvements** — Apply prompt_patches from judge suggestions

### 8.2 Format Key

- Admin format: `adminFormatKey` (commander, standard, modern, pioneer, pauper) — used when running tests without format in input

---

## 9. API Routes Summary

| Route | Method | Purpose |
|-------|--------|---------|
| /api/admin/ai-test/cases | GET, POST, PUT, DELETE | Test case CRUD, merge JSON+DB |
| /api/admin/ai-test/run | POST | Single test run |
| /api/admin/ai-test/batch | POST | Batch run |
| /api/admin/ai-test/validate | POST | Validate response without running |
| /api/admin/ai-test/quality | GET, POST | Quality scores, update |
| /api/admin/ai-test/coverage | GET | Tag coverage |
| /api/admin/ai-test/trends | GET | Pass rate trends |
| /api/admin/ai-test/schedule | GET, POST, PUT, DELETE | Schedules |
| /api/admin/ai-test/history | GET | Eval run history |
| /api/admin/ai-test/results | GET, POST, PUT | ai_test_results |
| /api/admin/ai-test/regressions | GET | Regression detection |
| /api/admin/ai-test/consistency | POST | Run N times, compute consistency |
| /api/admin/ai-test/composed-prompt | GET | Preview composed prompt |
| /api/admin/ai-test/prompt-impact | GET | Compare runs before/after prompt version |
| /api/admin/ai-test/import | POST | Import test cases |
| /api/admin/ai-test/import-pdf | POST | Import from PDF |
| /api/admin/ai-test/generate-from-failures | POST | Create cases from failures |
| /api/admin/ai-test/apply-improvements | POST | Apply prompt patches |
| /api/admin/ai-test/templates | GET, POST | Test templates |
| /api/admin/ai-test/save-history | POST | Save eval run summary |
| /api/cron/ai-test-run | POST | Cron: run scheduled batches |

---

## 10. ExpectedChecks Schema (expected_checks)

```ts
{
  shouldContain?: string[];
  shouldNotContain?: string[];
  shouldMentionCard?: string[];
  shouldNotMentionCard?: string[];
  maxLength?: number;
  minLength?: number;
  formatSpecific?: boolean;
  requireDeckStyle?: boolean;
  requireProblemsFirst?: boolean;
  requireSynergy?: boolean;
  requireConsistency?: boolean;
  requireBudgetAwareness?: boolean;
  requireToneMatch?: boolean;
  requireSpecificity?: boolean;
  requireLegalIdentity?: boolean;
  requireColorIdentitySafe?: boolean;
  requirePermanentsOnly?: boolean;
  requireNoHallucinatedCards?: boolean;
  minTribalDensity?: { tribe: string; minPercent: number };
  maxTotalCards?: number;
  minTotalCards?: number;
  mustNotRecommendExcessiveLands?: boolean;
  maxRecommendedLandsToAdd?: number;
  // Deck analysis specific:
  minRampMention?: number;
  minDrawMention?: number;
  mustFlagLowLands?: boolean;
  shouldNotSuggestCard?: string[];
  minSynergyScore?: number;
  expectedAnswer?: string;  // For semantic similarity
}
```

---

## 11. Known Gaps & Limitations

1. **No cost aggregation** — Test costs not reported in admin
2. **No golden decklist mode** — `eval-set-discipline.md` suggests 5–10 golden decks; not implemented
3. **Alert email** — Schedule has `alert_email` but "TODO: Send email" in cron
4. **JSON file often empty** — Seed data lives in migrations, not `ai_test_cases.json`
5. **ai_test_cases / ai_test_results** — No CREATE TABLE in migrations; tables assumed to exist (likely created elsewhere or manually)
6. **Maintenance mode** — Batch blocks when `checkMaintenance()` is enabled

---

## 12. Files Reference

| File | Purpose |
|------|---------|
| `frontend/app/admin/ai-test/page.tsx` | Admin UI |
| `frontend/app/api/admin/ai-test/run/route.ts` | Single run |
| `frontend/app/api/admin/ai-test/batch/route.ts` | Batch run |
| `frontend/app/api/admin/ai-test/cases/route.ts` | Test case CRUD |
| `frontend/app/api/admin/ai-test/quality/route.ts` | Quality metrics |
| `frontend/app/api/admin/ai-test/validate/route.ts` | Validate only |
| `frontend/app/api/admin/ai-test/composed-prompt/route.ts` | Prompt preview |
| `frontend/app/api/cron/ai-test-run/route.ts` | Scheduled runs |
| `frontend/lib/ai/test-validator.ts` | All validation logic |
| `frontend/lib/config/prompts.ts` | Prompt version loading |
| `frontend/lib/prompts/composeSystemPrompt.ts` | 3-layer composition |
| `frontend/lib/data/ai_test_cases.json` | JSON test cases |
| `frontend/lib/data/banned_cards.json` | Format banlists |
| `frontend/docs/ai/eval-set-discipline.md` | Golden deck discipline |

---

## 13. Suggested Rework Priorities

1. **Cost visibility** — Aggregate ai_usage by route/source for test runs; show in admin
2. **Golden decklist mode** — Implement fixed deck set + checks from eval-set-discipline
3. **Schema documentation** — Add CREATE TABLE for ai_test_cases, ai_test_results, eval_runs if missing
4. **Validation toggles** — Consider per-check weights or strict/lenient modes
5. **Caching** — Optional cache for identical inputs to reduce cost during development
6. **Alert delivery** — Implement email/webhook when schedule pass rate < threshold
