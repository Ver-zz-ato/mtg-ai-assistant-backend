# Cost/Quality Verification Report
Generated: 2026-05-14T13:26:12.038Z

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
| Cost audit | WARN | 50 rows, 45 mismatches |
| Quality Sentinel | WARN | 9 threshold(s) triggered |
| Tier replay | PASS | 21 passed, 0 failed |
| Panic switch tests | PASS | — |

**Executed checks:** 5/5
**DB checks executed:** yes


## Proof of execution

### Unit tests (pricing)
```
- start: 2026-05-14T13:26:12.038Z
- end: 2026-05-14T13:26:12.269Z
- duration_ms: 231
- command: node C:\Users\davy_\Projects\mtg_ai_assistant\frontend\node_modules\tsx\dist\cli.mjs tests/unit/pricing.test.ts
- exit_code: 0
```

### Panic switch tests
```
- start: 2026-05-14T13:26:12.269Z
- end: 2026-05-14T13:26:12.500Z
- duration_ms: 231
- command: node C:\Users\davy_\Projects\mtg_ai_assistant\frontend\node_modules\tsx\dist\cli.mjs tests/unit/panic-switches.test.ts
- exit_code: 0
```

### Cost audit
```
- start: 2026-05-14T13:26:12.500Z
- end: 2026-05-14T13:26:12.829Z
- duration_ms: 329
- command: node scripts/audit-ai-usage-cost.mjs --limit 50 --days 7 --json
- exit_code: 0
```

### Quality Sentinel
```
- start: 2026-05-14T13:26:12.829Z
- end: 2026-05-14T13:26:13.622Z
- duration_ms: 793
- command: node scripts/quality-sentinel.mjs 7 --json
- exit_code: 0
```

### Tier replay
```
- start: 2026-05-14T13:26:13.622Z
- end: 2026-05-14T13:26:13.888Z
- duration_ms: 267
- command: node C:\Users\davy_\Projects\mtg_ai_assistant\frontend\node_modules\tsx\dist\cli.mjs scripts/replay-tier-classification.mjs --json
- exit_code: 0
```

## Cost Audit

Rows checked: 50. Mismatches: 45.

Sample: [{"id":58519,"created_at":"2026-05-14T13:26:02.622329+00:00","route":"chat","model":"gpt-5.4-mini","stored":0.001037,"expected":0.002358,"absDiff":0.001321,"relDiff":"56.02%"},{"id":58518,"created_at":"2026-05-14T13:26:02.19964+00:00","route":"chat","model":"gpt-5.4-mini","stored":0.001994,"expected":0.005828,"absDiff":0.0038339999999999997,"relDiff":"65.79%"},{"id":58517,"created_at":"2026-05-14T13:25:26.248533+00:00","route":"swap_why","model":"gpt-5.4-mini","stored":0.000563,"expected":0.001448,"absDiff":0.000885,"relDiff":"61.12%"},{"id":58516,"created_at":"2026-05-14T13:25:24.235875+00:00","route":"deck_finish_suggestions","model":"gpt-5.4-mini","stored":0,"expected":0.002815,"absDiff":0.002815,"relDiff":"100.00%"},{"id":58515,"created_at":"2026-05-14T13:25:20.337091+00:00","route":"deck_analyze","model":"gpt-5.4-mini","stored":0.005741,"expected":0.015135,"absDiff":0.009394,"relDiff":"62.07%"}]

## Quality Sentinel

Total requests: 1000 (last 7 days).

Warnings: [
  {
    "type": "retry_spike",
    "route": "chat",
    "current": 342,
    "baseline": 50,
    "threshold": 75
  },
  {
    "type": "retry_spike",
    "route": "mulligan_advice",
    "current": 5,
    "baseline": 0,
    "threshold": 0
  },
  {
    "type": "retry_spike",
    "route": "deck_finish_suggestions",
    "current": 3,
    "baseline": 0,
    "threshold": 0
  },
  {
    "type": "retry_spike",
    "route": "swap_why",
    "current": 3,
    "baseline": 0,
    "threshold": 0
  },
  {
    "type": "retry_spike",
    "route": "suggestion_why",
    "current": 5,
    "baseline": 0,
    "threshold": 0
  },
  {
    "type": "retry_spike",
    "route": "deck_roast",
    "current": 8,
    "baseline": 0,
    "threshold": 0
  },
  {
    "type": "retry_spike",
    "route": "deck_roast_mobile",
    "current": 2,
    "baseline": 0,
    "threshold": 0
  },
  {
    "type": "retry_spike",
    "route": "card_explain_mobile",
    "current": 2,
    "baseline": 0,
    "threshold": 0
  },
  {
    "type": "retry_spike",
    "route": "layer0_off_topic_check",
    "current": 13,
    "baseline": 4,
    "threshold": 6
  }
]

## Tier Replay

21 passed, 0 failed.


## Warnings / Thresholds Triggered

- retry_spike: {"type":"retry_spike","route":"chat","current":342,"baseline":50,"threshold":75}
- retry_spike: {"type":"retry_spike","route":"mulligan_advice","current":5,"baseline":0,"threshold":0}
- retry_spike: {"type":"retry_spike","route":"deck_finish_suggestions","current":3,"baseline":0,"threshold":0}
- retry_spike: {"type":"retry_spike","route":"swap_why","current":3,"baseline":0,"threshold":0}
- retry_spike: {"type":"retry_spike","route":"suggestion_why","current":5,"baseline":0,"threshold":0}
- retry_spike: {"type":"retry_spike","route":"deck_roast","current":8,"baseline":0,"threshold":0}
- retry_spike: {"type":"retry_spike","route":"deck_roast_mobile","current":2,"baseline":0,"threshold":0}
- retry_spike: {"type":"retry_spike","route":"card_explain_mobile","current":2,"baseline":0,"threshold":0}
- retry_spike: {"type":"retry_spike","route":"layer0_off_topic_check","current":13,"baseline":4,"threshold":6}

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
