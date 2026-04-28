# Format tool phases — implementation report (2026-04-27)

## Constraints honored

- **No `Mixed` in APIs or shared enums:** Deck compare keeps **Commander** (or existing single-format behavior) when selected decks disagree; mobile shows a **warning** only.
- **Budget swaps:** No new client-side legality filtering on local suggestions; **disclaimer** on mobile; **`swap-suggestions`** server behavior unchanged in this pass.
- **Mulligan:** **Prompt-heavy** changes in `advice-handler`; no invasive deterministic land heuristic edits.
- **`POST /api/playstyle/explain`:** Optional **`format`**, default **Commander**; same **`{ paragraph, becauseBullets }`** (plus existing top-level **`ok`**, **`cached`** when applicable).
- **Git:** Changes committed in **`mtg_ai_assistant`** only; **Manatap-APP** not part of this repo.

## Phases touched (website / shared `frontend`)

| Phase | Area | Notes |
|-------|------|--------|
| 2 | `swap-why`, swap client, format helper | Optional format + commander on swap-why |
| 3 | Mulligan advice | Commander vs 60-card prompts; unit test |
| 4 | Deck compare (mobile prompt) | Constructed lens; mixed = UI warning elsewhere |
| 5 | Roast | `deck-roast.ts` + `roast-ai-prompt.ts` format branches |
| 6 | Playstyle explain + quiz wiring | Cache key + optional `explainFormat` → API `format` |
| 9 | SQL | **Skipped** (no migration) |
| 10–11 | Build / tests / changelog | `next build`, `npm run test:unit`, `CHANGELOG.md` |

## Verification

- `npm run build` (frontend): **success**
- `npm run test:unit`: **success**

## Follow-ups (optional)

- Wire **`explainFormat`** from deck-builder or format picker into **`PlaystyleQuizModal`** when product wants non-Commander quiz copy end-to-end.
- Live smoke **`POST https://www.manatap.ai/api/...`** after deploy (auth/rate limits).
