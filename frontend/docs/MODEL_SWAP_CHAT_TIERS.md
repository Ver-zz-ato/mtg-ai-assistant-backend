# Model Swap - Chat And Deck Tiers

**Current mapping:** Guest = `gpt-5.4-mini`, Free = `gpt-5.4-mini`, Pro chat/deck = `gpt-5.4`, Admin/evals = `gpt-5.5`.

## Runtime Defaults

- `MODEL_GUEST`: defaults to `gpt-5.4-mini`
- `MODEL_FREE`: defaults to `gpt-5.4-mini`
- `MODEL_PRO_CHAT`: defaults to `gpt-5.4`
- `MODEL_PRO_DECK`: defaults to `gpt-5.4`
- `MODEL_AI_TEST`: recommended `gpt-5.5` for admin/eval runs

## Why

- Guest and Free use the same cheap capable model so normal chat, card explain, and lightweight suggestions stay affordable.
- Pro uses the stronger model for deck chat, deck analysis, collection-aware advice, compare, roast, and other high-value responses.
- Admin/eval runs can use the deepest model without making every production response expensive.

## Verification

- `/api/admin/ai/model-config` shows effective model routing.
- AI usage dashboards use `lib/ai/pricing.ts` and `PRICING_VERSION` to price rows.

## Rollback

Set env overrides rather than changing code:

```env
MODEL_GUEST=gpt-4o-mini
MODEL_FREE=gpt-5-mini
MODEL_PRO_CHAT=gpt-5.1
MODEL_PRO_DECK=gpt-5.1
```
