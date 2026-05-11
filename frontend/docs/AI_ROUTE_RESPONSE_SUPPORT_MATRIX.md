# AI Route Response Support Matrix

Last reviewed: 2026-05-11

This document tracks user-facing AI/API response routes outside the main chat orchestrator. It is the companion to `docs/format-support-matrix.md`: that file says which formats ManaTap promises; this file says which AI routes are expected to respect that promise.

## Format Promise

First-class formats:

- Commander
- Modern
- Pioneer
- Standard
- Pauper

Limited formats:

- Legacy
- Vintage
- Brawl
- Historic

Limited formats may be recognized by legality/import helpers, but routes below should not claim full AI/tool support for them unless the route explicitly opts in.

## User-Facing AI Routes

| Route | Surface | First-class formats | Response contract | Stress coverage |
| --- | --- | --- | --- | --- |
| `/api/chat` | Website/app main chat | Commander, Modern, Pioneer, Standard, Pauper | MTG-only, format-aware, server-persisted | Chat regression suite |
| `/api/chat/stream` | Website/app streaming chat + deck chat | Commander, Modern, Pioneer, Standard, Pauper | MTG-only, format-aware, server-persisted stream | Chat regression suite |
| `/api/deck/analyze` | Website deck analysis | Commander, Modern, Pioneer, Standard, Pauper | Structured analysis, legal suggestions, no silent Commander fallback for explicit formats | `verify-ai-route-responses --heavy` |
| `/api/mobile/deck/analyze` | App deck analysis | Commander, Modern, Pioneer, Standard, Pauper | App-safe structured analysis | `verify-ai-route-responses --heavy` |
| `/api/deck/roast` | Website deck roast | Commander, Modern, Pioneer, Standard, Pauper | Roast tone, card links as `[[Card]]`, format-aware | `verify-ai-route-responses` |
| `/api/mobile/deck/roast-ai` | App deck roast | Commander, Modern, Pioneer, Standard, Pauper | JSON roast payload, format-aware | `verify-ai-route-responses` |
| `/api/mobile/card/explain` | App card modal explain/tactics | Card-level, format-neutral | Must explain supplied oracle text only; no invented price/legality | `verify-ai-route-responses` |
| `/api/mulligan/advice` | Mulligan advisor | Commander, Modern, Pioneer, Standard, Pauper | Keep/mulligan advice with format-aware heuristics | `verify-ai-route-responses` |
| `/api/deck/finish-suggestions` | Finish/improve deck suggestions | Commander, Modern, Pioneer, Standard, Pauper | Legal suggestions, sideboard-aware for constructed | `verify-ai-route-responses` |
| `/api/deck/swap-suggestions` | Budget swaps | Commander, Modern, Pioneer, Standard, Pauper | Cheaper same-role swaps, legal for format, Commander color identity only for Commander | `verify-ai-route-responses` |
| `/api/deck/swap-why` | Swap explanation | Commander, Modern, Pioneer, Standard, Pauper | Short explanation, no Commander wording in constructed | `verify-ai-route-responses` |
| `/api/deck/suggestion-why` | Suggestion explanation | Commander, Modern, Pioneer, Standard, Pauper | Short explanation, format-aware fallback | `verify-ai-route-responses` |
| `/api/mobile/deck/compare-ai` | App deck comparison | Commander, Modern, Pioneer, Standard, Pauper | JSON comparison, neutral labels for constructed | `verify-ai-route-responses --heavy` |
| `/api/deck/generate-constructed` | Constructed deck generator | Modern, Pioneer, Standard, Pauper | 60-card main + 15-card sideboard, no Commander concepts | `verify-ai-route-responses --heavy` |
| `/api/playstyle/explain` | Playstyle quiz explanation | Commander, Modern, Pioneer, Standard, Pauper | Short JSON explanation, no Commander assumptions in constructed | `verify-ai-route-responses` |
| `/api/decks/health-report` | Pro health report | Commander, Modern, Pioneer, Standard, Pauper | Format-aware health report | Not in default stress script because it requires a saved owned deck |
| `/api/deck/health-suggestions` | Saved-deck category suggestions | Commander, Modern, Pioneer, Standard, Pauper | Format-aware suggestions for owned decks | Not in default stress script because it requires a saved owned deck |
| `/api/custom-cards/generate` | Custom card creation | N/A | Creative card JSON; not a deck-format tool | Out of format-support scope |
| `/api/shout/auto-generate` | Shoutbox automation | N/A | Social/activity text; not a deck-format tool | Out of format-support scope |
| `/api/admin/*` AI routes | Admin diagnostics | N/A | Internal/admin-only | Out of public response-quality scope |

## Response Quality Rules

For first-class deck-format routes:

- Do not describe Modern/Pioneer/Standard/Pauper lists as Commander, EDH, singleton, pod politics, command zone, or color identity unless those words appear on actual card names or the user explicitly asks for comparison.
- Commander routes may use commander, color identity, singleton, social-table, and pod language.
- Card names intended for inline linking should use `[[Card Name]]`.
- If a route cannot support a requested explicit format, it should return a clear unsupported/limited message instead of silently behaving as Commander.
- Suggestions must be filtered by legality where the route returns card recommendations.

## Repeatable Stress Command

Run a local production server first:

```powershell
npm run build
npm run start -- -p 3105
```

Then run:

```powershell
$env:BASE_URL='http://localhost:3105'
npm run verify:ai-routes
```

For heavier, more expensive checks:

```powershell
$env:BASE_URL='http://localhost:3105'
npm run verify:ai-routes -- --heavy
```

Auth-backed checks use `AI_STRESS_EMAIL`/`AI_STRESS_PASSWORD`, or fall back to `DEV_LOGIN_EMAIL`/`DEV_LOGIN_PASSWORD` from `.env.local`. Auth-only cases are skipped if credentials are unavailable.
