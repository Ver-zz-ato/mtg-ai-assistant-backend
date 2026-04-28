# Generate Constructed -- Template seeding retest (authenticated)

**Endpoint:** `POST https://www.manatap.ai/api/deck/generate-constructed`  
**Date:** 2026-04-28  
**Fixture folder:** `%TEMP%\mtg-gen-template-retest` (local JSON bodies matching the four scenarios below; auth via local credentials -- token not stored in this file)

---

## Executive summary

**Mixed.** Template seeding improved **Pioneer** (now **200**, main **60**, side **15**) and **Modern** / **Pauper** remain healthy. **Standard Azorius Control** still returns **502** `GENERATION_FAILED`, so the Standard path needs additional work before calling production verification complete.

---

## Results table

| Test | HTTP | ok | main | side | pass/fail | notes |
|------|------|-----|------|------|-----------|-------|
| Standard WU Control | 502 | false | -- | -- | **FAIL** | `GENERATION_FAILED` -- Standard still failing after template patch |
| Pioneer Mono-G Ramp | 200 | true | 60 | 15 | **PASS** | Meets shape checks; prior short-main / 502 issues not reproduced |
| Modern BR Midrange | 200 | true | 60 | 15 | **PASS** | Sanity stable |
| Pauper Burn | 200 | true | 60 | 15 | **PASS** | Sanity stable |

---

## Issues found

1. **Standard WU Control:** HTTP **502**, `ok: false`, `error: GENERATION_FAILED` -- blocks full pass for this matrix.
2. **Pioneer:** No issues flagged by automated checks on this run (main 60, side 15).
3. **Modern / Pauper:** No issues flagged on this run.

Automated checks used: HTTP 200; `ok: true`; main **60**; side **>= 10** (ideal 15); `deckText` present; no Commander/EDH/singleton/100-card wording in `deckText` + `explanation`; response colors within requested identity; no `Sol Ring` in `deckText`; explanation Title-Case phrases checked against `deckText` (heuristic).

---

## Recommendation

**NEEDS FURTHER PATCH** -- Standard constructed generation still fails in production for this scenario; resolve Standard reliability before **READY FOR APP QA** for the full four-case matrix.
