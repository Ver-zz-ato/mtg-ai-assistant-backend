# Generate Constructed — Retest (authenticated)

**Endpoint:** `POST https://www.manatap.ai/api/deck/generate-constructed`  
**Date:** 2026-04-28  

**Fixtures:** `C:/Users/davy_/AppData/Local/Temp/mtg-gen-retest`

## 1. Executive summary

**FAIL** — one or more critical checks did not pass.

## 2. Results table

| Test | HTTP | ok | main | side | Result |
|------|------|-----|------|------|--------|
| Standard WU Control | 502 | false | — | — | FAIL |
| Pioneer Mono-G Ramp | 502 | false | — | — | FAIL |
| Modern BR Midrange | 200 | true | 60 | 15 | PASS |

## 3. Per-test notes

### Standard WU Control

- **Issues:** HTTP 502 ok=false error=GENERATION_FAILED

### Pioneer Mono-G Ramp

- **Issues:** HTTP 502 ok=false error=GENERATION_FAILED

### Modern BR Midrange

- **Issues:** none flagged by automated checks.

## 4. Remaining issues

- See per-test **Issues** lines above.

## 5. Recommendation

**NEEDS FURTHER PATCH** — at least one scenario failed validation or HTTP expectations.
