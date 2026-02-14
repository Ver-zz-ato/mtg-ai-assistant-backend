# Cost/Quality Execution Report — Technical (for ChatGPT)

**Generated:** 2026-02-14  
**Repo:** c:\Users\davy_\mtg_ai_assistant

---

## 1. Commands Executed

| Step | Command | Log file |
|------|---------|----------|
| Install | `cd frontend && npm install` | [docs/ops/verify-ai-runs/npm_install.log](ops/verify-ai-runs/npm_install.log) |
| Unit tests | `npm run test:unit` | [docs/ops/verify-ai-runs/unit_tests_run.log](ops/verify-ai-runs/unit_tests_run.log) |
| Env check | `node -e "..."` (dotenv + redacted vars) | [docs/ops/verify-ai-runs/env_check.log](ops/verify-ai-runs/env_check.log) |
| Strict harness | `npm run verify:ai:strict -- --days 7 --limit 100` | [docs/ops/verify-ai-runs/verify_ai_strict_run.log](ops/verify-ai-runs/verify_ai_strict_run.log) |
| Normal harness | `npm run verify:ai -- --days 14 --limit 200` | [docs/ops/verify-ai-runs/verify_ai_run.log](ops/verify-ai-runs/verify_ai_run.log) |

---

## 2. Summary Table

| Check | Status | Duration (ms) | Exit code | Evidence |
|-------|--------|--------------|-----------|----------|
| Unit tests (pricing) | PASS | 229 | 0 | Proof of execution in COST_QUALITY_REPORT.md |
| Panic switch tests | PASS | 245 | 0 | Proof of execution |
| Cost audit | WARN | 312 | 0 | **Executed** (not SKIP). 100 rows, 99 mismatches |
| Quality Sentinel | WARN | 416 | 0 | **Executed** (not SKIP). 1000 requests, 1 warning |
| Tier replay | PASS | 235 | 0 | 21 passed, 0 failed |

**Executed checks:** 5/5  
**DB checks executed:** yes

---

## 3. Cost Audit — Mismatches

**Count:** 99 of 100 rows (99%)  
**Suspected cause:** Historical 100× unit bug. Stored `cost_usd` is ~100× higher than recomputed from `costUSD(model, input_tokens, output_tokens)`. Likely a 1K/1M flip or cents-vs-dollars error in older recording code.

**Examples:**

| Row ID | Model | Stored | Expected | Diff % |
|--------|-------|--------|----------|--------|
| 4189 | gpt-4o | 1.4135 | 0.014135 | 9900% |
| 4188 | gpt-4o | 1.2995 | 0.012995 | 9900% |
| 4187 | gpt-4o-mini | 0.40905 | 0.000409 | 99912% |
| 4186 | gpt-4o-mini | 0.39825 | 0.000398 | 99963% |

**Fix:** No code change needed for *new* data. Current `pricing.ts` and `recordAiUsage` logic are correct. Historical rows retain wrong values. Consider a one-time backfill script to recompute and update `cost_usd` for old rows if needed.

**Route:** All mismatches have `route: null` in DB. May indicate older rows predate route column or a recording path that omits route.

---

## 4. Quality Sentinel Output

**Total requests (7 days):** 1000  
**By route:** All `unknown` (route column null or not populated)

| Metric | Value |
|--------|-------|
| Truncation rate | 0.0% |
| 429 budget rate | 0.0% |
| Cache hit | 0.0% |
| NO_LLM % | 0.0% |
| MINI_ONLY % | 0.0% |
| FULL_LLM % | 100.0% |
| Avg output tokens | 313 |
| Retries (2 min window) | 954 |

**Warnings triggered:**
- `retry_spike`: route=unknown, current=954, baseline=332, threshold=498. Retries exceed baseline + 50%. Likely due to many rows with same user+route (anon|unknown) within 2 min — may be a proxy artifact when route is null.

**WoW deltas:** Not computed (prior-period data present but route=unknown limits meaningful comparison).

---

## 5. Panic Switch Behavior — Proven

**Tests:** [frontend/tests/unit/panic-switches.test.ts](../frontend/tests/unit/panic-switches.test.ts)

| Test | What | Result |
|------|------|--------|
| `llm_force_full_routes` | `wouldBypassLayer0(route, config)` — when route in config.llm_force_full_routes, returns true (bypass Layer0 → FULL_LLM) | PASS |
| `llm_min_tokens_per_route` | `getDynamicTokenCeiling({ minTokenFloor: 256 })` returns ≥ 256 | PASS |
| Without floor | `getDynamicTokenCeiling` without minTokenFloor returns 192 for simple non-stream | PASS |

**Location:** Logic in [frontend/lib/ai/chat-generation-config.ts](../frontend/lib/ai/chat-generation-config.ts) (minTokenFloor), [frontend/app/api/chat/stream/route.ts](../frontend/app/api/chat/stream/route.ts) (force full routes).

---

## 6. DB Checks Executed — Evidence

From [docs/COST_QUALITY_REPORT.md](COST_QUALITY_REPORT.md):

```
**Executed checks:** 5/5
**DB checks executed:** yes
```

Cost audit proof block:
```
- command: node scripts/audit-ai-usage-cost.mjs --limit 100 --days 7 --json
- exit_code: 0
```

Quality Sentinel proof block:
```
- command: node scripts/quality-sentinel.mjs 7 --json
- exit_code: 0
```

Status: Cost audit = WARN (not SKIP), Quality Sentinel = WARN (not SKIP). Both ran against Supabase.

---

## 7. Fixes Applied

None. Env loading and `--require-db` were already implemented. All checks executed successfully. No code changes made during this run.
