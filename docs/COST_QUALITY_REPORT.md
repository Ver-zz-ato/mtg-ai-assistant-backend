# Cost/Quality Verification Report
Generated: 2026-02-14T19:41:28.894Z

## Env check

| Variable | Value |
|----------|-------|
| hasSupabaseUrl | true |
| hasServiceRoleKey | true |
| requireDb | false |

## Summary

| Check | Status | Notes |
|-------|--------|-------|
| Unit tests (pricing + panic switches) | PASS | — |
| Cost audit | WARN | 200 rows, 196 mismatches |
| Quality Sentinel | WARN | 1 threshold(s) triggered |
| Tier replay | PASS | 21 passed, 0 failed |
| Panic switch tests | PASS | — |

**Executed checks:** 5/5
**DB checks executed:** yes


## Proof of execution

### Unit tests (pricing)
```
- start: 2026-02-14T19:41:28.894Z
- end: 2026-02-14T19:41:29.147Z
- duration_ms: 253
- command: node C:\Users\davy_\mtg_ai_assistant\frontend\node_modules\tsx\dist\cli.mjs tests/unit/pricing.test.ts
- exit_code: 0
```

### Panic switch tests
```
- start: 2026-02-14T19:41:29.147Z
- end: 2026-02-14T19:41:29.388Z
- duration_ms: 241
- command: node C:\Users\davy_\mtg_ai_assistant\frontend\node_modules\tsx\dist\cli.mjs tests/unit/panic-switches.test.ts
- exit_code: 0
```

### Cost audit
```
- start: 2026-02-14T19:41:29.388Z
- end: 2026-02-14T19:41:29.740Z
- duration_ms: 352
- command: node scripts/audit-ai-usage-cost.mjs --limit 200 --days 14 --json
- exit_code: 0
```

### Quality Sentinel
```
- start: 2026-02-14T19:41:29.740Z
- end: 2026-02-14T19:41:30.149Z
- duration_ms: 409
- command: node scripts/quality-sentinel.mjs 14 --json
- exit_code: 0
```

### Tier replay
```
- start: 2026-02-14T19:41:30.149Z
- end: 2026-02-14T19:41:30.390Z
- duration_ms: 241
- command: node C:\Users\davy_\mtg_ai_assistant\frontend\node_modules\tsx\dist\cli.mjs scripts/replay-tier-classification.mjs --json
- exit_code: 0
```

## Cost Audit

Rows checked: 200. Mismatches: 196.

Sample: [{"id":4189,"created_at":"2026-02-14T17:59:56.792232+00:00","route":null,"model":"gpt-4o","stored":1.4135,"expected":0.014135,"absDiff":1.399365,"relDiff":"9900.00%"},{"id":4188,"created_at":"2026-02-14T17:59:26.655441+00:00","route":null,"model":"gpt-4o","stored":1.2995,"expected":0.012995,"absDiff":1.286505,"relDiff":"9900.00%"},{"id":4187,"created_at":"2026-02-14T17:59:13.016158+00:00","route":null,"model":"gpt-4o-mini","stored":0.40905,"expected":0.000409,"absDiff":0.40864100000000003,"relDiff":"99912.22%"},{"id":4186,"created_at":"2026-02-14T17:59:12.477421+00:00","route":null,"model":"gpt-4o-mini","stored":0.39825,"expected":0.000398,"absDiff":0.397852,"relDiff":"99962.81%"},{"id":4185,"created_at":"2026-02-14T17:59:10.319076+00:00","route":null,"model":"gpt-4o-mini","stored":0.4203,"expected":0.00042,"absDiff":0.41988000000000003,"relDiff":"99971.43%"}]

## Quality Sentinel

Total requests: 1000 (last 14 days).

Warnings: [
  {
    "type": "retry_spike",
    "route": "unknown",
    "current": 954,
    "baseline": 33,
    "threshold": 50
  }
]

## Tier Replay

21 passed, 0 failed.


## Warnings / Thresholds Triggered

- retry_spike: {"type":"retry_spike","route":"unknown","current":954,"baseline":33,"threshold":50}

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
