# Scanner AI API (mobile)

Three-phase scanner AI for the live Vision scanner and photo scan flows.

## Endpoints

### `POST /api/cards/scan-disambiguate` (Phase A — stealth)

**Purpose:** Text-only OpenAI pick among fuzzy/OCR candidates (no image upload).

**Body (JSON):**

| Field | Type | Notes |
|-------|------|--------|
| `normalizedOcrText` | string | Optional, max 400 chars |
| `ocrCandidates` | string[] | Max 5 |
| `fuzzyMatches` | `{ name, score? }[]` | Max 5 |
| `collectorHint` | string | Optional SET+number resolution |
| `sessionCardNames` | string[] | Optional tray bias, max 8 |
| `aiTriggerReason` | string | e.g. `ambiguous_scores` |
| `scanSessionId` / `scanAttemptId` | string | Analytics |
| `sourcePage` / `usageSource` | string | Attribution |

**Response:** `{ ok, recognition, tier, limit, remaining, resetAt }` — same `recognition` shape as vision route (`source: "ai_text"`).

**Limits:** guest **8** / free **40** per day (`SCAN_DISAMBIGUATE_*`). **Pro:** no daily cap on scanner routes (global AI budget still applies).

**Model:** Same tier routing as chat — `getModelForTier` via `lib/scanner/scan-ai-models.ts` (guest → `MODEL_GUEST` / `DEFAULT_GUEST_MODEL`, free → `MODEL_FREE`, pro → `MODEL_PRO_CHAT`). No `MODEL_SCAN_DISAMBIGUATE` env.

---

### `POST /api/cards/recognize-image` (Phase B & C)

**Phase B — AI Assist:** `assistMode=fallback` (default), prefer `imageRole=title` with title-band JPEG.

**Phase C — Pro-AI:** `assistMode=improve` (Pro only), `imageRole=full` with normalized card image.

**Multipart fields:**

| Field | Notes |
|-------|--------|
| `image` | JPEG/PNG/WebP, max 5MB |
| `scanContext` | JSON: OCR + fuzzy hints + `aiTriggerReason` |
| `assistMode` | `fallback` \| `improve` |
| `imageRole` | `title` \| `full` (logged on recognition) |
| `sourcePage` / `usageSource` | Attribution |

**Limits:** guest **3** / free **10** per day. **Pro:** no daily cap (global AI budget still applies).

**Models:** Tier routing — Assist (`fallback`) uses chat-tier models; Pro improve uses deck-tier Pro model (`MODEL_PRO_DECK` / `DEFAULT_PRO_DECK_MODEL`). See `getScannerVisionModel` in `lib/scanner/scan-ai-models.ts`.

## Shared validation

Both routes validate AI output via `scryfall_cache` + `/api/cards/fuzzy` (`lib/scanner/scan-ai-core.ts`).

## Mobile

- `Manatap-APP/src/lib/scan/scan-ai-api.ts` — `disambiguateScanMatch`, `recognizeScanImage`
- Dev lab toggles: `/(tabs)/tools/scanner-current-ai-lab` → `scan?devLab=1&aiLab=1`
