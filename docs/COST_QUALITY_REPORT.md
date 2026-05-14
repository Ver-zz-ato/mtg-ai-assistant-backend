# Cost/Quality Verification Report
Generated: 2026-05-14T14:54:18.712Z

## Env check

| Variable | Value |
|----------|-------|
| hasSupabaseUrl | true |
| hasServiceRoleKey | true |
| requireDb | true |

## Summary

| Check | Status | Notes |
|-------|--------|-------|
| Unit tests (pricing + panic switches) | PASS | — |
| Cost audit | WARN | 50 rows, 27 mismatches |
| Quality Sentinel | WARN | 2 threshold(s) triggered |
| Tier replay | PASS | 21 passed, 0 failed |
| Panic switch tests | PASS | — |

**Executed checks:** 5/5
**DB checks executed:** yes


## Proof of execution

### Unit tests (pricing)
```
- start: 2026-05-14T14:54:18.714Z
- end: 2026-05-14T14:54:19.137Z
- duration_ms: 423
- command: node C:\Users\davy_\Projects\mtg_ai_assistant\frontend\node_modules\tsx\dist\cli.mjs tests/unit/pricing.test.ts
- exit_code: 0
```

### Panic switch tests
```
- start: 2026-05-14T14:54:19.137Z
- end: 2026-05-14T14:54:19.480Z
- duration_ms: 343
- command: node C:\Users\davy_\Projects\mtg_ai_assistant\frontend\node_modules\tsx\dist\cli.mjs tests/unit/panic-switches.test.ts
- exit_code: 0
```

### Cost audit
```
- start: 2026-05-14T14:54:19.480Z
- end: 2026-05-14T14:54:19.838Z
- duration_ms: 358
- command: node scripts/audit-ai-usage-cost.mjs --limit 50 --days 7 --json
- exit_code: 0
```

### Quality Sentinel
```
- start: 2026-05-14T14:54:19.838Z
- end: 2026-05-14T14:54:20.371Z
- duration_ms: 533
- command: node scripts/quality-sentinel.mjs 7 --json
- exit_code: 0
```

### Tier replay
```
- start: 2026-05-14T14:54:20.371Z
- end: 2026-05-14T14:54:20.655Z
- duration_ms: 284
- command: node C:\Users\davy_\Projects\mtg_ai_assistant\frontend\node_modules\tsx\dist\cli.mjs scripts/replay-tier-classification.mjs --json
- exit_code: 0
```

## Cost Audit

Rows checked: 50. Mismatches: 27.

Sample: [{"id":59920,"created_at":"2026-05-14T14:54:09.437816+00:00","route":"chat_stream","model":"gpt-5.4-mini","stored":0.013422,"expected":0.03516,"absDiff":0.021737999999999997,"relDiff":"61.83%"},{"id":59913,"created_at":"2026-05-14T14:54:01.51685+00:00","route":"chat","model":"gpt-5.4-mini","stored":0.000355,"expected":0.000797,"absDiff":0.00044199999999999996,"relDiff":"55.46%"},{"id":59912,"created_at":"2026-05-14T14:54:01.185214+00:00","route":"chat","model":"gpt-5.4-mini","stored":0.00061,"expected":0.001658,"absDiff":0.0010479999999999999,"relDiff":"63.21%"},{"id":59911,"created_at":"2026-05-14T14:53:57.044592+00:00","route":"chat","model":"gpt-5.4-mini","stored":0.000558,"expected":0.00125,"absDiff":0.000692,"relDiff":"55.36%"},{"id":59910,"created_at":"2026-05-14T14:53:55.801277+00:00","route":"chat","model":"gpt-5.4-mini","stored":0.000724,"expected":0.001908,"absDiff":0.001184,"relDiff":"62.05%"}]

## Quality Sentinel

Total requests: 1000 (last 7 days).

Warnings: [
  {
    "type": "retry_spike",
    "route": "chat",
    "current": 963,
    "baseline": 53,
    "threshold": 80
  },
  {
    "type": "retry_spike",
    "route": "suggestion_why",
    "current": 1,
    "baseline": 0,
    "threshold": 0
  }
]

## Tier Replay

21 passed, 0 failed.


## Warnings / Thresholds Triggered

- retry_spike: {"type":"retry_spike","route":"chat","current":963,"baseline":53,"threshold":80}
- retry_spike: {"type":"retry_spike","route":"suggestion_why","current":1,"baseline":0,"threshold":0}

## What to do if failing

- **Unit tests:** Fix `pricing.ts` or panic switch logic in `chat-generation-config.ts` / route handlers.
- **Cost audit:** Investigate mismatches; ensure `pricing.ts` matches stored `cost_usd` formula. Check for 1K/1M unit flips.
- **Tier replay:** Update `quality-sentinel-prompts.json` or fix `prompt-tier.ts` / `layer0-gate.ts`.
- **Quality warnings:** Review value-moment routes; consider enabling `llm_force_full_routes` for affected routes.
- **--require-db fail:** Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or remove --require-db.

## If you think we went too far

Set in `app_config` (via Admin API or Supabase):

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

**Exact commands:**
- Admin UI: `/admin/ai-usage` → Config tab → edit `llm_force_full_routes` and `llm_min_tokens_per_route`
- Or `GET/POST /api/admin/ai/config` with the above keys

## Skipped Checks

None.
