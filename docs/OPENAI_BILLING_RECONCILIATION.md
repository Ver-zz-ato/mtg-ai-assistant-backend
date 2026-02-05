# OpenAI billing reconciliation

**Purpose:** Keep `ai_usage.cost_usd` estimates aligned with actual OpenAI invoices and support margin visibility.

## Cost estimate and versioning

- **`cost_usd`** in `ai_usage` is computed from [frontend/lib/ai/pricing.ts](frontend/lib/ai/pricing.ts) (per-model $/1K tokens). It is an **estimate**, not the invoice amount.
- **`pricing_version`** is stored on every `ai_usage` row (e.g. `"2026-02-05"`). When you change the pricing table in `pricing.ts`, bump the `PRICING_VERSION` constant so historical rows remain interpretable and you can compare periods before/after a change.

## Monthly reconciliation

1. In OpenAI dashboard, get the billing total (and optionally by model) for the month.
2. From your data: sum `ai_usage.cost_usd` for the same period (e.g. via admin cost-summary endpoint `GET /api/admin/ai-usage/cost-summary?from=YYYY-MM-DD&to=YYYY-MM-DD`).
3. Compare. If the estimator consistently diverges (e.g. under/over by >10%), update the pricing table in `pricing.ts` and bump `PRICING_VERSION`. Document the discrepancy and any one-off adjustments.

## Admin cost summary endpoint

- **GET /api/admin/ai-usage/cost-summary** (admin-only)
- Query params: `from`, `to` (date range), or `days` (default 30). Optional `userId` for shadow billing.
- Returns JSON: `totals`, `by_model`, `by_feature` (route), `by_day`. If `userId` is provided, also returns `shadow_billing.user_ai_cost_today_usd` and `shadow_billing.user_ai_cost_month_usd` for that user.

Use this for monthly reconciliation and to verify impact of guardrail changes.
