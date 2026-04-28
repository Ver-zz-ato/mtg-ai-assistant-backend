# Generate Constructed — Live Production Test Report (authenticated)

**Endpoint:** `POST https://www.manatap.ai/api/deck/generate-constructed`  
**Base URL:** `https://www.manatap.ai`  
**Auth:** `Authorization: Bearer <Supabase user access_token>` (session JWT from Supabase Auth password grant — **token not stored in this file**)  
**Bodies:** `%TEMP%\mtg-gen-auth-live\test1.json` … `test7.json` (same payloads as prior guest matrix)  
**Date:** 2026-04-28  

---

## Executive summary


| Area                    | Result                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Authenticated quota** | Seven sequential POSTs completed **without** `RATE_LIMIT_DAILY`; Bearer auth bypassed guest caps as expected.                                                                  |
| **HTTP outcomes**       | **200** on tests **1, 2, 4, 5, 7** (`ok: true`). **400** on test **6** (invalid format). **502** on test **3** (`GENERATION_FAILED`) — **also failed on one immediate retry**. |
| **Acceptance vs goal**  | Goal was **200 + ok:true** for **1–5 and 7**, and **400** for Legacy — **test 3 (Standard Azorius)** did **not** meet success criteria.                                        |


---

## Test table


| Test  | Scenario                   | HTTP    | `ok`      | Notes                                                  |
| ----- | -------------------------- | ------- | --------- | ------------------------------------------------------ |
| **1** | Modern Rakdos Midrange     | **200** | **true**  | Main **60**, side **13**, price **424.95** USD         |
| **2** | Pioneer Mono Green         | **200** | **true**  | Main **56**, side **14** — **below 60 main**           |
| **3** | Standard Azorius Control   | **502** | **false** | `**GENERATION_FAILED`** — repeated after retry         |
| **4** | Pauper Burn                | **200** | **true**  | Main **60**, side **15**, price **92.99** USD          |
| **5** | Modern Aggro (no colors)   | **200** | **true**  | AI chose **Gruul R/G** shell; main **60**, side **15** |
| **6** | Invalid `Legacy` format    | **400** | **false** | `**validation_error`** on `format` enum ✓              |
| **7** | Modern Burn + `ownedCards` | **200** | **true**  | Main **60**, side **13**; includes Bolt / Swiftspear   |


---

## Validation checklist (successful responses)

For `**ok: true`** responses inspected:


| Check                                  | Result                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `format` matches request               | Pass on all success cases                                                                     |
| `deckText` present                     | Pass                                                                                          |
| `mainboardCount` ≈ 60                  | **Fail on test 2** (**56**); others **60**                                                    |
| `sideboardCount` ≈ 15 (or 0)           | **13–15** observed — documented                                                               |
| Commander-only staples (e.g. Sol Ring) | **No** `Sol Ring` substring in any success `deckText`                                         |
| Commander / EDH wording                | No hits for obvious Commander phrases in sampled bodies                                       |
| `explanation` array                    | Present where `ok: true`                                                                      |
| `metaScore` / `confidence`             | Present in success payloads                                                                   |
| `colors` vs request                    | Matches when provided (**1, 2, 4, 7**); **5** had no input colors — AI returned **["R","G"]** |
| `estimatedPriceUsd`                    | Present on all `**ok: true`** responses (numeric)                                             |


### TEST 6 — invalid format (expected failure)

- **HTTP 400**
- Body shape:

```json
{
  "ok": false,
  "error": "validation_error",
  "details": {
    "formErrors": [],
    "fieldErrors": {
      "format": [
        "Invalid enum value. Expected 'Modern' | 'Pioneer' | 'Standard' | 'Pauper', received 'Legacy'"
      ]
    }
  }
}
```

---

## Sample outputs (trimmed)

### TEST 1 — Modern Rakdos (`200`, success)

- `**mainboardCount`:** 60 · `**sideboardCount`:** 13 · `**estimatedPriceUsd`:** 424.95  
- `**warnings`** included legality removals + **color-identity** removals for **BR**, plus narrative caveats (some boilerplate may reference cards not in the final list — treat as advisory).

### TEST 3 — Standard Azorius (`502`, failure)

```json
{ "ok": false, "error": "GENERATION_FAILED" }
```

(Retry once — same `**GENERATION_FAILED**`.)

---

## Issues found


| Issue                            | Severity   | Detail                                                                                                                                                                 |
| -------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TEST 3 persistent 502**        | **High**   | Standard Azorius **never** returned `**ok: true`** in two attempts — investigate AI JSON parse, post-filters, or mainboard floor (**54**) server-side.                 |
| **TEST 2 main = 56**             | **Medium** | Contract emphasizes ~**60** main; model delivered **56** total mainboard quantity — consider stronger prompt constraint or post-validation padding (product decision). |
| **Explanation vs list (TEST 2)** | **Low**    | Explanation references **Karn, the Great Creator** while `**deckText`** does not list Karn — copy mismatch only.                                                       |
| **TEST 1 warnings text**         | **Low**    | `**warnings`** may reference hypothetical sideboard tech (e.g. off-color hate) already stripped by filters — confusing but not blocking.                               |


### Color identity (when colors provided)

- **TEST 1 (`BR`):** Response `**warnings`** explicitly mention **color filtering** and removed copies for **BR** — aligns with server-side identity enforcement.  
- **TEST 7 (`R`):** `**warnings`** cite copies removed to match **mono-R**.  
- Not manually oracle-verified card-by-card; spot checks found **no Sol Ring** and lists stayed within requested colors at a string-review level.

---

## Recommendations

1. **Investigate TEST 3 / Standard** failures (`GENERATION_FAILED`): add temporary logging or replay with fixed seed to see whether the model returns malformed JSON, fails legality or **main < 54**, or times out.
2. **Deck size:** If **60 + 15** is mandatory, add a completion retry when `**mainboardCount` < 58** after filtering (without touching Commander routes).
3. **QA harness:** Keep `**SUPABASE_ACCESS_TOKEN`** (or Supabase password grant) in CI secrets for full-matrix regression; guest-only runs will hit **429** after one call.
4. **Explanation hygiene:** Optionally strip lines from `**warnings`**/`explanation` that reference cards no longer in `**deckText**`.

---

## How to rerun (authenticated)

1. Obtain a **Supabase Auth `access_token`** (password login, refresh session, or CI secret).
2. POST each `testX.json` with:

```http
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json
```

1. Expect **400 + validation_error** only for unsupported `**format`** values (e.g. Legacy).

---

*Test-only report; no application source changes.*