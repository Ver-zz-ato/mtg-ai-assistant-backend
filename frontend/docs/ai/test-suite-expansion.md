# AI Test Suite Expansion

This document describes the expanded AI test suite features: Golden Sets, Pairwise A/B, Mutations, Cost Reporting, Alerting, and Human Review.

## Golden Sets

Golden sets are curated collections of test cases (decks or chat prompts) that must pass with strict gating before deployment. They act as a **regression gate**, not a polite suggestion.

### Creating a Golden Set

1. Go to Admin → AI Test → **Eval Sets** tab
2. Create a set via `POST /api/admin/ai-test/eval-sets` with:
   - `name`: Unique name
   - `type`: `golden_deck` | `golden_chat` | `mixed`
   - `test_case_ids`: Array of test case UUIDs
   - `strict`: `true` (default) — fail entire set if any test fails
   - `min_overall_score`: Default 80
   - `require_critical_violations_zero`: Default true
   - **Gating thresholds** (configurable per set):
     - `max_critical_violations`: Max allowed critical violations (default 0)
     - `max_total_violations`: Max total violations across checks (default 2)
     - `min_specificity_score`: Min score for specificity (default 70)
     - `min_actionability_score`: Min score for actionability (default 70)
     - `min_format_legality_score`: Min format legality when format provided (default 90)
     - `require_clarifying_question_when_missing_info`: Require clarifying Q when info missing (default false)
     - `require_refusal_on_illegal_request`: Require refusal when test has `illegal_request` tag (default true)
   - `difficulty_preset`: `standard` | `strict` | `safety_first` — applies preset overrides

### Running a Golden Set

- Click **Run Golden Set** in the UI, or
- `POST /api/admin/ai-test/run-eval-set` with `{ eval_set_id, validation_options, format_key }`

### Gating Logic (Brutal by Default)

Each test result is evaluated against the set's gating config. A case **fails** if any threshold is violated:

| Threshold | Description | Default |
|-----------|-------------|---------|
| `min_overall_score` | Overall validator score | 80 |
| `max_critical_violations` | Color/format violations from reference compare | 0 |
| `max_total_violations` | Total failed checks | 2 |
| `min_specificity_score` | Concrete card names, not generic advice | 70 |
| `min_actionability_score` | Actionable suggestions | 70 |
| `min_format_legality_score` | Format legality (when format_key provided) | 90 |
| `require_clarifying_question_when_missing_info` | Must ask clarifying Q when info missing | false |
| `require_refusal_on_illegal_request` | Must refuse when test tagged `illegal_request` | true |

### Validator Breakdown

The validator emits a structured `validatorBreakdown`:

- **categoryScores**: factuality, legality, specificity, actionability, structure, tone, safety
- **violations**: critical count, total count, list of messages
- **flags**: askedClarifyingQuestions, refusedWhenNeeded, hallucinationRisk

### Difficulty Presets

- **Standard**: Uses set's configured thresholds as-is
- **Strict**: For `golden_deck`: min_format_legality ≥ 90, max_total_violations ≤ 1. For `golden_chat`: min_actionability ≥ 75, min_specificity ≥ 75
- **Safety-First**: min_format_legality ≥ 95, max_total_violations ≤ 1, min_actionability ≥ 75, min_specificity ≥ 75

### Run Output (ai_eval_set_runs.meta)

- `pass_rate`, `failing_case_ids`
- `top_failing_categories`: [{ category, count }]
- `worst_offenders`: [{ case_id, case_name, reasons, score }]
- `regression_hints`: Human-readable failure summary

### Strict Mode

- If `strict=true` and any test fails gating, the entire set is marked failed
- The run output explains exactly why the set failed, in human-readable reasons

---

## Pairwise A/B Evaluation

Compare two prompt versions or model configs. **Winner is determined by a rubric-based LLM judge** (human-taste aligned), not by validator score. Validator scores are kept for analytics.

### Running A/B

1. Go to Admin → AI Test → **Compare A/B** tab
2. Click **Run Pairwise** or `POST /api/admin/ai-test/pairwise` with:
   - `test_case_ids`: Optional; omit to use first 20
   - `prompt_version_id_a`, `prompt_version_id_b`: Optional; defaults to current active
   - `judge_model`: Model for judging (default: gpt-4o-mini)
   - `judge_mode`: `all` | `close_calls` | `sample` — when to run judge
   - `close_call_threshold`: Score diff ≤ this = close call (default 5)
   - `sample_rate`: For `sample` mode, fraction to judge (default 0.3)

### Rubric-Based Judge (rubric_v1)

The judge is **blind** (sees Answer 1 / Answer 2 with no labels) and **grounded** (test intent, constraints, optional reference facts). Returns JSON:

- `winner`: A | B | TIE
- `confidence`: 0–1
- `scores`: clarity, specificity, actionability, correctness, constraint_following, tone, calibration (0–10 each)
- `reasons`: Short list
- `major_faults`: { A: [...], B: [...] }

### Interpreting Results

- **By Judge** (primary): win_rate_a_by_judge, win_rate_b_by_judge, tie_rate_by_judge
- **By Validator**: win_rate_a_by_validator, win_rate_b_by_validator (kept for analysis)
- **Disagreement rate**: % where judge winner ≠ validator winner
- **Avg judge confidence**, **avg rubric scores**

### Cost

Judge calls are tracked in `ai_usage` with `source='ai_test_pairwise_judge'` and `eval_run_id`. Visible in cost report as `judge_cost_usd`.

---

## Cost Reports

View cost and latency for eval runs.

### Usage

1. Run a batch test (creates `eval_run_id`)
2. Go to Admin → AI Test → **Cost** tab
3. Enter the eval run ID and click **Load Report**

Or: `GET /api/admin/ai-test/cost-report?eval_run_id=...`

### Response

- `total_cost_usd`, `total_tokens_in`, `total_tokens_out`
- `by_route`, `by_model`: Breakdown
- `judge_cost_usd` vs `main_cost_usd`: Judge calls (e.g. LLM fact-check) vs main test execution
- `avg_latency_ms`: Average latency per LLM call

### Linking

- `ai_usage.eval_run_id` links usage rows to eval runs
- Set when batch/run-eval-set passes `eval_run_id` to `/api/chat` and `/api/deck/analyze`

---

## Fuzz / Mutation Generator

Create edge-case variants from existing tests.

### Mutation Types

- `missing_commander`, `messy_decklist`, `contradictory_budget`, `format_omitted`
- `typos_decklist`, `reordered_lines`, `duplicated_entries`
- `near_miss_card` (hallucination guard), `irrelevant_chatter`, `empty_user_message`

### Usage

- **Single**: Select a test case, go to **Mutations** tab, click **Generate Mutations**
- **Bulk**: `POST /api/admin/ai-test/generate-mutations` with:
  - `base_test_case_ids`: Array of IDs
  - `mutation_types`: Optional; defaults to all
  - `count_per_case`: Default 1

### Output

- New `ai_test_cases` with `source='mutation'` and tags `mutation:<type>`
- `ai_test_mutations` links base → mutated case

---

## Alerting

### Webhook (Discord-compatible)

Add `alert_webhook_url` to `ai_test_schedules`. When a scheduled run has `pass_rate < alert_threshold`:

- POST JSON to the webhook with suite name, run id, pass rate, failing tags, link to admin
- `alert_on_regression` (default true) controls whether to fire

### Email

- TODO: Implement email alerts when `alert_email` is set

---

## Human Review Queue

Sample production outputs for human calibration of judges.

### Sampling

- **Sample from Production**: `POST /api/admin/ai-test/sample-production` with `{ count }`
- Pulls recent `ai_usage` rows (sanitized), inserts into `ai_human_reviews`

### Review UI

- Admin → AI Test → **Human Review** tab
- View input + output, add labels (factuality, usefulness, tone, etc.)
- Mark as reviewed

### Schema

- `ai_human_reviews`: `source`, `route`, `input`, `output`, `labels`, `status`, `meta`
