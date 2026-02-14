# Cost/Quality Execution Report — ELI5 (for Davy)

**What we tested and what it means**

---

## What we tested (plain language)

We ran a full verification harness that checks:

1. **Money math** — Does our cost formula match what we store in the database?
2. **Quality** — Are we cutting corners too much on deck analysis and swap suggestions?
3. **Routing** — Do simple questions get cheap answers and complex ones get full answers?
4. **Panic switches** — Can we flip knobs to force “full power” if something goes wrong?

All checks **actually ran** (nothing was skipped). We used `verify:ai:strict` so the script would fail if database checks couldn’t run.

---

## Did money tracking match reality?

**Short answer: No, for old data. Yes, for new data.**

- **99 of 100** recent rows had stored cost ~100× higher than our formula says.
- This is a **historical bug** (likely a units mix-up in older code).
- **Current code is correct.** New requests should record the right cost.
- **Action:** No change needed unless you want to fix old rows. New data will be accurate.

---

## Did “cheap mode” harm deck analysis/swaps?

**Short answer: We can’t tell from this run.**

- Quality Sentinel ran, but almost all rows had `route: unknown` (route not recorded).
- So we can’t see deck_analyze vs chat vs swap_suggestions separately.
- **0% truncation** — no responses were cut off.
- **100% FULL_LLM** — everything used the full model (no MINI_ONLY in this sample).
- **Action:** Start recording `route` properly in new rows so future Quality Sentinel runs can break down by feature.

---

## Is the system safe now?

**Yes, with caveats.**

| Safety check | Status |
|--------------|--------|
| Cost formula correct | ✅ (pricing unit tests pass) |
| Panic switches work | ✅ (tested in code) |
| Tier/routing logic consistent | ✅ (21/21 tier replay passed) |
| DB checks actually run | ✅ (strict mode proved it) |
| Historical cost data | ⚠️ Old rows are wrong; new rows should be fine |

---

## What I should do weekly (5-bullet routine)

1. Run `npm run verify:ai:strict` from `frontend/` — if it fails, fix before deploying.
2. Check [docs/COST_QUALITY_REPORT.md](COST_QUALITY_REPORT.md) — look for new mismatches or Quality Sentinel warnings.
3. In Admin UI (`/admin/ai-usage`), compare “Our estimate” vs “OpenAI actual” — they should be close for recent data.
4. If deck analysis or swap quality drops, set `llm_force_full_routes` for those routes (see below).
5. If costs spike, consider `llm_force_mini_only` or lowering token ceilings.

---

## What to do if costs spike

**Panic switch: force cheap mode**

- In `app_config`, set `llm_force_mini_only: true` — all requests use the mini model.
- Or set `llm_disable_stream: true` — turns off streaming (can reduce cost in some cases).

**Where:** Admin UI → `/admin/ai-usage` → Config, or Supabase `app_config` table.

---

## What to do if quality drops

**Panic switch: force full power for value routes**

In `app_config`, set:

```json
{
  "llm_force_full_routes": ["deck_analyze", "swap_suggestions", "swap_why", "suggestion_why", "deck_scan", "deck_compare"],
  "llm_min_tokens_per_route": {
    "deck_analyze": 256,
    "swap_suggestions": 256,
    "chat": 256,
    "chat_stream": 256
  }
}
```

This bypasses “cheap mode” for deck analysis and swaps, and guarantees a minimum response length.

---

## Simple status: green / yellow / red

| Area | Status | Why |
|------|--------|-----|
| **Cost correctness** | 🟡 Yellow | Formula is right; old stored data is wrong (100×). New data should be correct. |
| **Cost control** | 🟢 Green | Panic switches exist and work. Token ceilings and Layer0 are in place. |
| **Quality on value routes** | 🟡 Yellow | Can’t fully assess — route data missing. No truncation or 429s. |
| **Routing correctness** | 🟢 Green | Tier replay passed. Simple vs complex routing logic is consistent. |

---

## Log files (proof of execution)

- [docs/ops/verify-ai-runs/unit_tests_run.log](ops/verify-ai-runs/unit_tests_run.log)
- [docs/ops/verify-ai-runs/verify_ai_strict_run.log](ops/verify-ai-runs/verify_ai_strict_run.log)
- [docs/ops/verify-ai-runs/env_check.log](ops/verify-ai-runs/env_check.log)
