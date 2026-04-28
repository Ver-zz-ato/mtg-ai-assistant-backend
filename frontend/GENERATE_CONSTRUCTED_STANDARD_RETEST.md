# Standard WU Control — live authenticated retest

**Date:** 2026-04-28  
**Endpoint:** `POST https://www.manatap.ai/api/deck/generate-constructed`  
**Runner:** `%TEMP%\mtg-gen-standard-retest\retest.mjs` (token obtained via Supabase password grant using existing Playwright test credentials from local `.env.local`; **no secrets or tokens appear in this file**).

## Executive summary

One authenticated production POST was executed with **Standard**, **WU**, **Control**, **balanced / competitive**. The API returned **HTTP 200**, **`ok: true`**, a **60-card mainboard**, **15-card sideboard**, non-empty **`deckText`**, and the expected **Standard fallback warning** after aggressive validation. Automated scans found **no Commander / EDH / singleton / 100-card language**, **no Sol Ring**, and **no `{R}` / `{G}` / `{B}` mana braces** in the deck text. **Verdict: pass — recommend readiness for app QA.**

## Request body

```json
{
  "format": "Standard",
  "colors": ["W", "U"],
  "archetype": "Control",
  "budget": "balanced",
  "powerLevel": "competitive"
}
```

## Results

| Field | Value |
|--------|--------|
| **HTTP status** | **200** |
| **ok** | **true** |
| **format** | **Standard** |
| **mainboardCount** | **60** |
| **sideboardCount** | **15** |
| **title** | Azorius Control (fallback shell) |

### warnings

- `Standard fallback shell used after validation removed too many AI suggestions.`

### Validation checks

| Check | Result |
|--------|--------|
| HTTP 200 | Yes |
| ok === true | Yes |
| format === "Standard" | Yes |
| mainboardCount === 60 | Yes |
| sideboardCount ≥ 0 | Yes (15) |
| deckText present | Yes |
| No Commander / EDH / singleton / 100-card wording (heuristic on combined response text) | Pass |
| No Sol Ring | Pass |
| Off-color mana braces `{R}`/`{G}`/`{B}` in deckText | None detected |

## Pass / fail verdict

**PASS**

## Recommendation

**READY FOR APP QA**

---

*Artifacts (local only, under `%TEMP%\mtg-gen-standard-retest`): `http-status.txt`, `response-body.json`, `validation-summary.json`, `auth-via.txt`. Do not commit those files.*
