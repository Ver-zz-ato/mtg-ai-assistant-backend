# Chat Tier Model Swap (Guest / Free / Pro)

**Date:** Model config update.  
**Mapping:** Guest = gpt-4o-mini, Free = gpt-5-mini, Pro = gpt-5.1 (unchanged).

---

## Summary

- **MODEL_GUEST:** unchanged (gpt-4o-mini).
- **MODEL_FREE:** default changed from gpt-4o → **gpt-5-mini**.
- **MODEL_PRO_CHAT:** unchanged (gpt-5.1).

Single source of truth: `lib/ai/model-by-tier.ts` (`getModelForTier`). All chat routes, admin tools, and debug payloads use this; no hardcoded Free model elsewhere.

---

## Files changed

| File | Change |
|------|--------|
| `lib/ai/model-by-tier.ts` | `FREE_DEFAULT = "gpt-5-mini"`; comment updated. |
| `.env.example` | Comment and `MODEL_FREE` example set to gpt-5-mini. |
| `app/api/admin/ai/model-config/route.ts` | `note` updated to Free=gpt-5-mini. |
| `app/admin/chat-flow-test/page.tsx` | Tier dropdown: "Free (gpt-5-mini)". |
| `docs/AI_CHAT_FLOW.md` | Table: Free → gpt-5-mini. |
| `docs/CHAT_TIER_AUDIT_FOLLOWUP.md` | Two mentions: Free = gpt-5-mini. |
| `docs/IMPLEMENTATION_SUMMARY_THREAD_DECK_SLOTS.md` | Free → gpt-5-mini. |

---

## Env variables

Optional overrides (defaults in code):

- `MODEL_GUEST` — default gpt-4o-mini
- `MODEL_FREE` — default **gpt-5-mini**
- `MODEL_PRO_CHAT` — default gpt-5.1

Set locally or in deployment only if you want to override (e.g. `MODEL_FREE=gpt-4o` to revert Free to gpt-4o).

---

## Revert

1. Restore `FREE_DEFAULT = "gpt-4o"` in `lib/ai/model-by-tier.ts`.
2. Revert `.env.example`, model-config `note`, chat-flow-test label, and the three docs to previous Free = gpt-4o wording.
3. Or checkout branch `before-model-swap` and re-apply only the changes you want to keep.

---

## Verification

- **Guest path:** `getModelForTier({ isGuest: true, ... })` → model `gpt-4o-mini`.
- **Free path:** `getModelForTier({ isGuest: false, userId: 'x', isPro: false })` → model `gpt-5-mini`.
- **Pro path:** `getModelForTier({ isGuest: false, userId: 'x', isPro: true })` → model `gpt-5.1`.

Admin isolated chat (`/admin/chat-flow-test`): tier dropdown and debug/response show the same models. Analytics and `recordAiUsage` use the model returned by `getModelForTier`, so no code changes there.
