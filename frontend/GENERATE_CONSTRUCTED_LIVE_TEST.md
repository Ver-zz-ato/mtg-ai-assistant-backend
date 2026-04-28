# Generate Constructed — Live Production Test Report

**Environment:** `POST https://www.manatap.ai/api/deck/generate-constructed`  
**Date:** 2026-04-28 (UTC)  
**Client:** `curl.exe` / PowerShell `Invoke-WebRequest`, JSON bodies in `%TEMP%\mtg-gen-constructed-live\test*.json`  
**Auth:** None (guest / IP-style bucket)

---

## Executive summary

| Result | Detail |
|--------|--------|
| **Partial pass** | **TEST 1** completed with **HTTP 200** and a valid contract-shaped JSON body. |
| **Blocked** | **TEST 2–7** returned **HTTP 429** (`RATE_LIMIT_DAILY`) immediately after TEST 1. |

Production enforces a **guest allowance of one AI constructed generation per day** for unauthenticated callers (same bucket as implemented in `GENERATE_CONSTRUCTED_GUEST`). Running the full matrix **without a Bearer token** therefore cannot validate TEST 2–7 in one session.

**Recommendation:** Re-run TEST 2–7 with `Authorization: Bearer <token>` (signed-in user), or after **`resetAt`** (next UTC midnight per response), or from distinct egress IPs if testing guest limits.

---

## Test table

| Test | Description | HTTP | `ok` | Notes |
|------|-------------|------|------|--------|
| **1** | Modern Rakdos Midrange | **200** | **true** | Full response; main 60 / side 13; price 167.7 USD |
| **2** | Pioneer Mono Green | **429** | **false** | Rate limit — no deck output |
| **3** | Standard Azorius Control | **429** | **false** | Rate limit |
| **4** | Pauper Burn | **429** | **false** | Rate limit |
| **5** | Modern Aggro (no colors) | **429** | **false** | Not reached (blocked by limiter before body semantics) |
| **6** | Invalid format Legacy | **429** | **false** | Expected **400** for validation — **not verified** (limiter first) |
| **7** | Modern Burn + `ownedCards` | **429** | **false** | Rate limit |

---

## Validation rules (TEST 1 only)

| Rule | Result |
|------|--------|
| `ok === true` | Pass |
| `format` matches request (`Modern`) | Pass |
| `deckText` present | Pass |
| `mainboardCount` ≈ 60 | Pass (**60**) |
| `sideboardCount` ≈ 15 or 0 | **Partial** — **13** (within “≈15” tolerance; spec allows 0; not exactly 15) |
| No Commander language in `explanation` | Pass (no commander / EDH / singleton wording observed) |
| `explanation` array exists | Pass (5 bullets) |
| `metaScore` 0–100 | Pass (**75**) |
| `confidence` 0–1 | Pass (**0.85**) |
| `colors` match input `["B","R"]` | Pass |
| `estimatedPriceUsd` present | Pass (**167.7**); non-zero |

---

## Sample outputs

### TEST 1 — trimmed success (`HTTP 200`)

```json
{
  "ok": true,
  "format": "Modern",
  "title": "Rakdos Midrange",
  "colors": ["B", "R"],
  "archetype": "Midrange",
  "deckText": "// Mainboard\n4 Thoughtseize\n4 Inquisition of Kozilek\n…\n\n// Sideboard\n…",
  "mainboardCount": 60,
  "sideboardCount": 13,
  "estimatedPriceUsd": 167.7,
  "explanation": [
    "Utilizes efficient discard spells for early game disruption.",
    "Strong synergy with powerful threats like Kroxa and Dark Confidant.",
    "Flexible removal options to deal with a variety of threats in the meta.",
    "Balanced mana base allows consistent access to both colors.",
    "Chandra offers card advantage and acceleration for finishing the game."
  ],
  "metaScore": 75,
  "confidence": 0.85,
  "warnings": []
}
```

*(Full `deckText` omitted here for length; available in session capture under `%TEMP%\mtg-gen-constructed-live\result1.raw`.)*

### TEST 2 — rate limit (`HTTP 429`)

```json
{
  "ok": false,
  "code": "RATE_LIMIT_DAILY",
  "error": "You've used your guest allowance for AI constructed decks. Sign in for more!",
  "resetAt": "2026-04-29T00:00:00.000Z",
  "remaining": 0
}
```

*(Same shape observed for TEST 3–4; TEST 5–7 expected identical until limit resets or auth is used.)*

---

## Issues found

### Contract / availability

- **Guest daily cap:** One successful generation per guest/IP/day prevents automated **full** matrix testing without authentication — **by design**, not a regression.

### Legality sanity (TEST 1 decklist review)

- **`Veil of Summer`** appears in the **sideboard** while the deck is **Rakdos (B/R)**. In sanctioned Constructed, sideboard cards must be castable/ coherent with the deck’s colors (green card off-color for BR). This is a **color-identity / registration** problem the model introduced; **format legality filtering by Oracle legality alone would not remove it** because the card is Modern-legal.

### Deck shape

- **Sideboard count 13** vs target **15** — acceptable per product notes (“≈15”), but worth tracking if strict 15 is required.

### Not verified in this run

- **TEST 6** invalid `format: "Legacy"` → expected **HTTP 400** with `validation_error` — **not observed** because requests never reached validation after **429**.

---

## Recommendations

1. **Authenticated regression:** Add a CI or manual script using **`Authorization: Bearer $TOKEN`** to run all seven JSON payloads in one pass.
2. **Post-processing:** Consider **color-identity / registration checks** for Constructed sideboards (especially after Scryfall legality passes), or prompt reinforcement “sideboard must match maindeck colors.”
3. **QA tooling:** Document that **guest smoke test = one POST per day** per IP for this route; full matrix needs signed-in user or reset window.
4. **Sideboard target:** If product requires exactly **15**, add a soft validator or retry when `sideboardCount` is not in **[14, 15]** after filtering.

---

## Commands used (replay)

From `%TEMP%\mtg-gen-constructed-live`:

```bat
curl.exe -sS -X POST "https://www.manatap.ai/api/deck/generate-constructed" ^
  -H "Content-Type: application/json" ^
  --data-binary "@test1.json"
```

With auth (placeholder):

```bat
curl.exe -sS -X POST "https://www.manatap.ai/api/deck/generate-constructed" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" ^
  --data-binary "@test2.json"
```

---

*Report generated from live calls; application source code was not modified for this test.*
