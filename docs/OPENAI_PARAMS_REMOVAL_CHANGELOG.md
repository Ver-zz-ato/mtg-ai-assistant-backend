# OpenAI Params Removal Changelog

**Date:** January 2025  
**Goal:** Eliminate all `temperature`, `top_p`, and `max_tokens` from OpenAI requests so Responses API models (gpt-5, gpt-4o-mini, etc.) never error with "temperature not supported" or "max_tokens not supported."

---

## What Was Done

### 1. Central sanitizer (`frontend/lib/ai/openai-params.ts`)

- **`sanitizeOpenAIParams(payload)`** – Strips `temperature`, `top_p`, and `max_tokens` from any request object. Mutates in place, returns the same object.
- **`assertNoForbiddenParams(payload)`** – **Dev-only.** Throws if any of those keys are present. Catches accidental reintroduction.
- **`prepareOpenAIBody(payload)`** – Runs assert (dev) then sanitize. **Use this for every OpenAI request before sending.**

All OpenAI call sites now build a body, call `prepareOpenAIBody(body)`, then `JSON.stringify` and `fetch`. No route can bypass the sanitizer because it’s applied at the point of sending.

### 2. Removed `temperature` / `top_p` from every OpenAI call

| File | Change |
|------|--------|
| `app/api/deck/health-suggestions/route.ts` | Removed `temperature: 0.7`. Use `prepareOpenAIBody` + `max_completion_tokens` only. |
| `app/api/deck/compare-ai/route.ts` | Removed `temperature: 0.7`. Use `prepareOpenAIBody` + `max_completion_tokens`. |
| `backend/app.py` | Removed `temperature=TEMP` and `top_p=1.0`. Use `max_completion_tokens` only. |
| `backend/index.js` | Removed `temperature: 0.7`. Use `max_completion_tokens: 1000`. |

Other routes (chat, stream, analyze, swap-*, etc.) never sent `temperature`/`top_p`; they now also use `prepareOpenAIBody` for consistency and to guard against future additions.

### 3. `max_tokens` → `max_completion_tokens` everywhere

- All remaining usages already use `max_completion_tokens` (from the earlier fix). The sanitizer additionally deletes any `max_tokens` if it ever reappears.
- `frontend/lib/ai/completion-limits.ts` defines limits (scan, suggestions, chat, etc.) and `getMaxTokenParam(model, limit)` returns `{ max_completion_tokens }` or `{}` for o1/o3.

### 4. Unit test (`frontend/tests/unit/openai-params.test.ts`)

- Asserts `sanitizeOpenAIParams` removes `temperature`, `top_p`, `max_tokens` and leaves `max_completion_tokens` and other keys.
- Asserts `prepareOpenAIBody` strips forbidden keys.
- Asserts `assertNoForbiddenParams` throws in dev when a forbidden param is present.
- Run: `npm run test:unit` or `npm run test:unit:openai`.

### 5. Files touched (summary)

- **New:** `frontend/lib/ai/openai-params.ts`, `frontend/tests/unit/openai-params.test.ts`
- **Updated:** All API routes that call OpenAI (health-suggestions, compare-ai, chat, stream, debug/llm, deck/analyze, swap-suggestions, swap-why, cards/reprint-risk, admin ai-test generate/analyze-failures/generate-from-failures, lib/ai/openai-client, lib/ai/test-validator)
- **Updated:** `backend/app.py`, `backend/index.js`
- **Updated:** `frontend/package.json` – `test:unit` now runs both canonicalize and openai-params tests.

---

## Reassurance

- **Single, clear change:** Every OpenAI request goes through `prepareOpenAIBody`. We only add/sanitize params; we don’t change route logic, auth, or prompts.
- **Easy to revert:** If needed, you can stop using `prepareOpenAIBody` and restore previous request shapes. The edits are localized to “build body → prepare → send.”
- **Guarded against regressions:** The sanitizer removes forbidden params. The dev assertion throws if they’re added again. The unit test locks in the behavior.
- **AI Deck Scan and other AI features:** They no longer send `temperature` or `max_tokens`, so “temperature not supported” and “max_tokens not supported” errors from these models should be gone. If you still see issues, they’re likely from a different cause (e.g. model name, API key, or network).

---

## Quick reference

- **Sanitizer:** `frontend/lib/ai/openai-params.ts`
- **Completion limits:** `frontend/lib/ai/completion-limits.ts`
- **Unit test:** `npm run test:unit:openai`
