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

---

## Post-deploy live smoke — production (`https://www.manatap.ai`)

**When:** 2026-04-28 (UTC, ~00:37–00:38). **How:** `curl.exe` from Windows, JSON bodies via temp files, timeouts 60–300s. **Deploy:** HEAD to site returned **200** before POSTs.

| # | Endpoint | Scenario | HTTP | Result |
|---|----------|----------|------|--------|
| 1 | `POST /api/deck/finish-suggestions` | Modern, sparse main (~44/60) | 200 | **PASS** — `ok: true`, `format: "Modern"`, `suggestions` non-empty |
| 2 | `POST /api/deck/finish-suggestions` | Commander, sparse (~58/100), Niv-Mizzet | 200 | **PASS** — `ok: true`, `format: "Commander"`, suggestions + expected `warnings` (off-color skip) |
| 3 | `POST /api/collections/cost` | Modern list with **Sideboard** (Flusterstorm, Veil, Dress Down) | 200 | **PASS** — `ok: true`, rows include **`zone: "sideboard"`** and **`zone: "mainboard"`**, `format: "Modern"` |
| 4 | `POST /api/mulligan/advice` | Commander (`format: "commander"`) | 200 | **PASS** — `ok: true`, `action`, `cacheKey` ends with `:commander` |
| 5 | `POST /api/mulligan/advice` | Modern (`format: "modern"`) | 200 | **PASS** — `ok: true`, `cacheKey` ends with `:modern` |
| 6 | `POST /api/mobile/deck/roast-ai` | Pauper burn sketch, `format: "Pauper"` | 200 | **PASS** — `ok: true`, structured `roast` object |
| 7 | `POST /api/playstyle/explain` | `format: "modern"`, `level: "short"` | 200 | **PASS** — `ok: true`, `paragraph` + `becauseBullets`; copy is constructed/Burn-leaning (no Commander-only framing) |
| 8 | `POST /api/deck/swap-why` | Modern guest, `from`/`to`/`deckText`/`format` | 200 | **PASS** — `ok: true`, LLM `text` (no auth required) |
| 9 | `POST /api/mobile/deck/compare-ai` | Minimal body, **no session / Bearer** | **401** | **Blocked by auth, not a functional fail** — route requires signed-in user by design |

### Pass/fail notes

- All **guest-accessible** routes returned **200** with **`ok: true`** where expected. No **429** rate limits or **503** maintenance encountered on this IP for this run.
- **`/api/mobile/deck/compare-ai`:** **401 Unauthorized** without cookies or `Authorization: Bearer` — treat as **auth gate**, not a regression. Automated prod smoke for this route needs a **test user token** or CI secret.
- **`finish-suggestions`:** One suggestion name in the Commander response was a plausible **model typo** (“Narset, Parter of Veils”); legality filter still marked **`legal`** — optional follow-up is stricter name validation / Scryfall verify on suggestions, separate from format work.

### Recommended follow-ups

- Add an **optional authenticated** step in release QA (or CI with secrets) for **`compare-ai`** and any other **401-by-design** mobile routes.
- Re-run this matrix after large prompt or rate-limit changes; watch for **429** on shared CI IPs.
