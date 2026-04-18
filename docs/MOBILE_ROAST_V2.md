# Mobile Deck Roast v2 (structured JSON)

## Goals

- **Website unchanged:** `POST /api/deck/roast` and `lib/prompts/deck-roast.ts` stay as-is (plain-text roast, savageness 1–10, website UX).
- **Mobile-first contract:** `POST /api/mobile/deck/roast-ai` returns **stable JSON** tuned for small screens, section-by-section UI, and shareable one-liners.
- **Iteration safety:** `prompt_version` is bumped in code when prompt or schema expectations change; normalizer enforces caps and fallbacks.

## Route choice

| Option | Pros | Cons |
|--------|------|------|
| **`POST /api/mobile/deck/roast-ai`** (chosen) | Sits next to `compare-ai`; clear “mobile deck tools” namespace | Slightly longer path |
| `POST /api/roast/mobile` | Short | Mixes resource-first and mobile-first patterns already in repo |
| `POST /api/mobile/roast` | Short | Less consistent with `mobile/deck/compare-ai` |

**Recommendation:** Keep **`/api/mobile/deck/roast-ai`** as the canonical route. Optionally add a thin **rewrite** later (`/api/roast/mobile` → `roast-ai`) if you want a short URL—no duplicate handlers.

## Auth & tiers (current website parity)

- **Today:** `POST /api/deck/roast` does **not** require login; `callLLM` uses `userId: null`, `isPro: false`.
- **Mobile app:** Guests call roast **without** a Bearer token; signed-in users send `Authorization: Bearer …`.
- **v2 route:** **No auth required** to generate a roast (same product behavior as v1). When Bearer is present, the route resolves the user and passes **`userId` / `isPro`** into `callLLM` for **`ai_usage`** quality and cost attribution only—not for gating in v1 of this endpoint.

**Follow-up (product):** If you want server-enforced daily caps for signed-in free users (like `compare-ai`), add `checkDurableRateLimit` in a **separate PR** and document the behavior change; do not silently tighten guests without app + copy updates.

## Request body (JSON)

Aligned with existing roast where possible:

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `deckText` | string | yes | Same as `/api/deck/roast` |
| `format` | string | no | Default `Commander`; same allowed set as website |
| `commanderName` | string \| null | no | User override; else extracted for Commander |
| `heat` | `"mild"` \| `"medium"` \| `"spicy"` | no | Default via `savageness` fallback. **Case-insensitive** string accepted. |
| `savageness` | number | no | Ignored if `heat` set; else mapped like website (1–10) for internal tone only |
| `deckName` | string \| null | no | Optional display hint (saved deck title); model may still suggest a snappier label |
| `sourcePage` / `source_page` | string | no | Mobile attribution (`app_deck_roast`, etc.) |
| `usageSource` / `usage_source` | string | no | `manatap_app` for `ai_usage.source` |

**Prompt (server-side):** Injects **name-heuristic** deck signals (lands, ramp, wipes, draw, finishers, greedy mana) and a per-request **comedy-angle** line for variety. Model cross-checks counts against the list. Prompt iteration key: `MOBILE_ROAST_AI_PROMPT_VERSION` in `frontend/lib/mobile/roast-ai-prompt.ts`.

## Success response (JSON)

Top-level shape (stable for app integration):

```json
{
  "ok": true,
  "roast": {
    "deck_name": "string | null",
    "heat": "mild | medium | spicy",
    "verdict_summary": "string (at-a-glance deck problem / identity — not the hook)",
    "opening_jab": "string",
    "biggest_issues": [{ "title": "string", "body": "string", "cards": ["optional"] }],
    "card_callouts": [{ "card_name": "string", "line": "string" }],
    "final_verdict": "string",
    "share_line": "string (screenshot caption; ~≤110 chars ideal)",
    "prompt_version": "string"
  },
  "roastScore": 5,
  "meta": {
    "model": "string",
    "generated_at": "ISO-8601",
    "route": "/api/mobile/deck/roast-ai"
  }
}
```

- **`heat`:** After normalization, **always** echoes the **server-resolved** heat from the request (never trust the model for enum safety).
- **`roastScore:**** Echoes numeric savageness (e.g. mild=2, medium=5, spicy=8) for parity with legacy clients/analytics.
- **`prompt_version`:** Human-readable constant from `lib/mobile/roast-ai-prompt.ts` (bump when changing instructions or schema).

## Shared vs mobile-only code

| Piece | Location | Notes |
|-------|----------|--------|
| Deck list parse | `parseDeckText` | Shared (existing) |
| Commander extract | `extractCommanderFromDecklistText` | Shared (existing) |
| Name fix pass | `POST /api/deck/parse-and-fix-names` | Shared behavior; **prep helper** duplicates the fetch block until you opt to extract for both routes |
| **Prep orchestration** | `lib/roast/deck-roast-prep.ts` | **New** — `prepareDeckCardsForRoast(req, deckText)` (website route **not** refactored in v2 scaffold) |
| Website prompt & tone | `lib/prompts/deck-roast.ts` | **Do not use** for mobile JSON |
| **Mobile prompt** | `lib/mobile/roast-ai-prompt.ts` | **New** — short, punchy; strong Mild/Medium/Spicy separation; JSON-only instructions |
| **Mobile normalize** | `lib/mobile/roast-ai-response.ts` | **New** — zod + caps + `[[Card]]` hygiene (optional strip via legality helper) |
| **Route** | `app/api/mobile/deck/roast-ai/route.ts` | **New** — optional Bearer, `jsonResponse: true`, feature `deck_roast_mobile` |

**Phase 2 (optional, zero behavior change):** Replace inline prep in `app/api/deck/roast/route.ts` with `prepareDeckCardsForRoast` and a tiny `buildDeckSummary` — **only** after diff-testing one deck corpus.

## TypeScript types (app + backend)

Backend source of truth:

- `lib/mobile/roast-ai-types.ts` — `MobileRoastHeat`, `MobileRoastIssue`, `MobileRoastCardCallout`, `MobileRoastPayload`, `MobileRoastAiSuccessResponse`.

Mobile app can copy the `MobileRoastPayload` shape into `src/api/roast.ts` or a `src/types/roast-mobile.ts` when wiring.

## LLM / observability

- **Feature key:** `deck_roast_mobile` (distinct from `deck_roast` in `ai_usage`).
- **Timeout:** Same class as roast (60s); configurable via `DEFAULT_TIMEOUTS` in `unified-llm-client.ts`.
- **`jsonResponse: true`** on `callLLM` for `response_format: json_object`.

## Migration path (minimal risk)

1. **Ship backend** `POST /api/mobile/deck/roast-ai` behind the existing deploy (no feature flag required if unused).
2. **App:** Add `runDeckRoastMobile` (or flag in `runDeckRoast`) pointing to the new URL; parse JSON when `ok` and `roast` is object.
3. **UI:** Render section-by-section from `MobileRoastPayload`; keep a **fallback** that stringifies or maps sections if `prompt_version` unknown (normalizer already clamps shape).
4. **Share / permalinks:** `roast_permalinks.roast_text` is a string today. Either:
   - store `JSON.stringify(roast)` for v2 saves, or
   - add a `roast_json` column later (DB migration — separate decision).
5. **Deprecate** plain-text mobile path only after analytics show stable adoption.

## Testing

- Manual: same deck + heat through `/api/deck/roast` vs `/api/mobile/deck/roast-ai` — website output unchanged; mobile returns JSON with all keys.
- Unit: extend pattern from `deck-compare-mobile-response.ts` (zod normalization).

## Files (scaffold)

- `frontend/lib/roast/deck-roast-prep.ts`
- `frontend/lib/mobile/roast-ai-types.ts`
- `frontend/lib/mobile/roast-ai-prompt.ts`
- `frontend/lib/mobile/roast-ai-response.ts`
- `frontend/app/api/mobile/deck/roast-ai/route.ts`
- Observability: `unified-llm-client.ts`, `call-origin-map.ts`, `route-to-page.ts`, `tests/unit/ai-usage-route.test.ts`
