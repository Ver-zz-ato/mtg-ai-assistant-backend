# AI Test V3/V4 — Wiring model-backed suites

V3 (Behavioral Reasoning) and V4 (Adversarial Hallucination) are **model-backed** suites: each scenario sends a real user message to the chat API, captures the LLM response, then scores it with a deterministic rubric. They are currently **disabled** in the UI and return 501 from the run API. This doc explains where that is enforced and what’s needed to wire them.

---

## Where the “greyed out” state comes from

### 1. UI — Suites tab

**File:** `frontend/app/admin/ai-test-v3/page.tsx`

- **Line 268:** The “Run this suite” button is disabled unless the suite key is `v1`, `v2`, or `v5`:

  ```tsx
  disabled={runBusy || (s.key !== "v1" && s.key !== "v2" && s.key !== "v5")}
  ```

- **Line 276:** Footer text: *“V3 and V4 (model-backed) are not wired yet; V1, V2, and V5 (regression library) can be run.”*

So **v3** and **v4** are greyed out by design until the run route supports them.

### 2. API — Run route

**File:** `frontend/app/api/admin/ai-test-v3/run/route.ts`

- **Lines 40–46:** Before loading scenarios, the route explicitly rejects v3/v4:

  ```ts
  if (suiteKey === "v3" || suiteKey === "v4") {
    return NextResponse.json({
      ok: false,
      error: "V3/V4 model-backed runs not implemented in this route yet; use V1, V2, or V5.",
    }, { status: 501 });
  }
  ```

To enable V3/V4, remove this early return and add a branch that loads v3/v4 scenarios and runs them through the model runner (see below).

---

## What already exists

### Data and rubrics

- **DB:** Suites v3/v4 and their scenarios are seeded in `frontend/db/migrations/090_ai_test_v3_platform.sql` (V3: 12 scenarios, V4: 10). Each row has `scenario_definition_json` with:
  - `userMessage` — the prompt to send to chat
  - `deckContext` — e.g. `"multani_mono_green"` when the scenario needs a deck
  - `expectedTraits` / `forbiddenTraits` — used by the rubric

- **Rubrics (no LLM judge):**
  - `frontend/lib/admin/ai-v3/v3-rubric.ts` — `scoreV3Response(outputText, scenarioDef)` → score dimensions + status + hard/soft failures
  - `frontend/lib/admin/ai-v3/v4-rubric.ts` — `scoreV4Response(outputText, scenarioDef)` — same shape for V4

- **Model runner stubs:** `frontend/lib/admin/ai-v3/model-runner.ts`
  - `runV3Scenario(scenario, opts)` and `runV4Scenario(scenario, opts)` exist but **do not call the chat API**. They currently pass empty `outputText` and then run the rubric (so every scenario would fail).

### Types

- `frontend/lib/admin/ai-v3/types.ts` — `V3RunResult`, `V4RunResult`, score dimensions, status.

---

## What’s needed to wire V3/V4

### 1. Get real LLM output inside the model runner

In `model-runner.ts`, for each scenario you must:

1. Build request context from `scenario_definition_json`:
   - **userMessage** → send as the user message.
   - **deckContext** → when it’s `"multani_mono_green"` (or similar), the chat request must provide that deck so the model sees it. Other values (e.g. `"has_linked"`) can be handled later.

2. Call the chat API (same pattern as existing ai-test run/batch):
   - **File to mirror:** `frontend/app/api/admin/ai-test/run/route.ts` (lines 82–99) or `frontend/app/api/admin/ai-test/batch/route.ts` (lines 145–163).
   - **Endpoint:** `POST ${baseUrl}/api/chat` with:
     - `text: scenarioDef.userMessage`
     - `threadId: null` (each scenario is independent, or use one thread per run and pass deck via history — see below)
     - `prefs: { format: "Commander" }`
     - `context: { … }` if needed (see deck injection)
     - Forward **Cookie** (and optionally `forceModel`, `eval_run_id`) so the request is authenticated and rate limits / eval flags apply.

3. Read `responseText` from the JSON response (`chatData.text`), handle `chatData.fallback` / errors, then pass `responseText` into `scoreV3Response` / `scoreV4Response` instead of `""`.

**Deck injection for `deckContext: "multani_mono_green"`:**  
The chat route currently gets “pasted” deck from **thread history** (messages in DB). It does not accept a raw `deckText` in the body. Two options:

- **A) Eval-only body field:** In `frontend/app/api/chat/route.ts`, when `raw?.eval_run_id` (or a dedicated `raw?.eval_deck_text`) is set and `raw?.deckText` (or `raw?.context?.deckText`) is present, set `pastedDeckTextRaw = raw.deckText` and derive `pastedDecklistContext` / `pastedDecklistForCompose` from it (reusing the same parsing/analysis used for thread messages). Then the run route can pass `deckText: MONO_GREEN_DECKLIST` from `frontend/lib/admin/ai-v2/fixtures.ts` in the body when calling `/api/chat` for scenarios with `deckContext === "multani_mono_green"`.
- **B) Thread-based:** Create a thread, insert one “user” message containing the fixture decklist (e.g. via a minimal internal API or direct DB insert), then call `/api/chat` with `threadId` and `text: userMessage`. The existing “pasted decklist from history” logic will then see the deck. More moving parts; A is simpler for eval.

### 2. Run route: handle v3/v4 like v1/v2, but use the model runner

In `frontend/app/api/admin/ai-test-v3/run/route.ts`:

1. **Remove** the `if (suiteKey === "v3" || suiteKey === "v4") { return 501 }` block.

2. **Branch after** the existing v5 block:
   - If `suiteKey === "v3"` or `suiteKey === "v4"`:
     - Load scenarios from `ai_test_scenarios` for that `suite_key` (same as v1/v2), with `is_active = true`.
     - For each scenario row, build a `ModelRunnerScenario` (id, scenario_key, suite_key, scenario_definition_json).
     - Loop: call `runV3Scenario` or `runV4Scenario` (with optional `modelName` / `evalRunId` from body). Collect `V3RunResult` / `V4RunResult`.
     - Map results into the same `ai_test_run_results` shape (status, score_json, hard_failures_json, soft_failures_json, prompt_excerpt, output_text, etc.). Status mapping: use the rubric’s status (PASS/WARN/FAIL/HARD_FAIL) as-is.
     - Insert rows into `ai_test_run_results`, then update the run row (status, passed, warned, failed, hard_failures, soft_failures, completed_at, summary_json).

3. **Shared run creation:** Create the `ai_test_runs` row (status `running`, etc.) **before** the branch so v3/v4 use the same run record pattern as v1/v2/v5.

### 3. Optional: rate limits and cost

- Use `forceModel` (e.g. `gpt-4o-mini`) and/or `eval_run_id` in the chat request so you can identify and optionally exempt eval traffic from rate limits or cap cost (see how `batch` and `run-eval-set` do it).

### 4. Re-enable the UI

- In `page.tsx`, change the button `disabled` condition so that v3 and v4 are allowed when you’re ready (e.g. `disabled={runBusy}` only, or keep a feature flag).
- Update or remove the footer line “V3 and V4 (model-backed) are not wired yet…”.

---

## Summary

| Piece | Location | Action |
|-------|----------|--------|
| Disabled button | `page.tsx` line 268 | Allow `s.key === "v3"` and `s.key === "v4"` when wired |
| 501 response | `run/route.ts` lines 40–46 | Remove; add v3/v4 branch that loads scenarios, calls model runner, writes results |
| Real LLM call | `model-runner.ts` | Implement: build request from scenario def, call `/api/chat`, pass response into existing rubric |
| Deck for scenarios | Chat route or runner | Option A: add eval `deckText` in body and use it when `eval_run_id` set; Option B: create thread + insert deck message, then chat with that thread |
| Fixture deck | `ai-v2/fixtures.ts` | Use `MONO_GREEN_DECKLIST` when `deckContext === "multani_mono_green"` |

Once the run route returns 200 for v3/v4 and the runner fills in real `outputText`, the existing rubrics and DB schema will produce the same result shape as v1/v2/v5; no change to runs list or compare/export is strictly required.
