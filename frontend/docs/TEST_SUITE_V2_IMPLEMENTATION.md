# Test Suite V2 — Implementation Summary

## Overview

Test Suite V2 is an admin-facing AI evaluation workspace for ManaTap chat. It provides scenario-based testing for deck memory, rules grounding, deck intelligence, prompt contracts, adversarial cases, and formatting edge cases.

**Admin UI label:** V2  
**Route:** `/admin/test-suite-v2`

## Hardening (Mar 2025)

- **deckReplacedByHashChange** promoted to hard failure (was soft)
- **Prompt block taxonomy** — precise names: RULES_FACTS_BLOCK, DECK_INTELLIGENCE_BLOCK, COMMANDER_CONFIRMED_BLOCK, COMMANDER_CONFIRMATION_BLOCK, COMMANDER_NEED_BLOCK
- **Adversarial split** — partial-with-strong-candidate vs partial-without-strong-candidate
- **Role cluster fix** — deck-plan-profile no longer assigns ramp sorceries to interaction/card_flow/finishers
- **Semantic validation** — V2 checks role clusters for ramp-in-finishers etc., reports hard/soft
- **Result status** — PASS, PASS_WITH_WARNINGS, HARD_FAIL; UI shows scenariosWithWarnings, scenariosWithSemanticIssues

## Files Created/Changed

### New Files

| Path | Purpose |
|------|---------|
| `frontend/lib/admin/ai-v2/types.ts` | Scenario and result type definitions |
| `frontend/lib/admin/ai-v2/fixtures.ts` | Mock rules bundles and v2 summary for deterministic runs |
| `frontend/lib/admin/ai-v2/assemble-blocks.ts` | Prompt block assembly (RULES FACTS, DECK INTELLIGENCE) |
| `frontend/lib/admin/ai-v2/runner.ts` | Scenario runner; executes turns, validates expectations |
| `frontend/lib/admin/ai-v2/scenarios/index.ts` | 25 seed scenarios across 6 categories |
| `frontend/app/api/admin/test-suite-v2/scenarios/route.ts` | GET list of scenarios |
| `frontend/app/api/admin/test-suite-v2/run/route.ts` | POST run selected or all scenarios |
| `frontend/app/admin/test-suite-v2/page.tsx` | Admin UI: overview, scenario list, run controls, results |
| `frontend/docs/TEST_SUITE_V2_IMPLEMENTATION.md` | This document |

### Modified Files

| Path | Change |
|------|--------|
| `frontend/app/admin/JustForDavy/page.tsx` | Added V2 link under AI & Chat section |

## Scenario Categories

- **State / Memory** — deck paste, commander inference, confirmation, correction, linked deck, override
- **Rules / Legality** — commander eligibility, banned cards, oracle vs physical
- **Deck Intelligence** — ramp mix, plan identification, synergies, tensions
- **Prompt Contract** — RULES FACTS only, DECK INTELLIGENCE only, both, commander blocks
- **Adversarial** — partial decklist, bait phrasing
- **Fuzz / Formatting** — altered decklist formatting, commander header variants

## Runner Behavior

1. Builds scenario state (thread, linked deck, prior messages)
2. For each turn: resolves `ActiveDeckContext`, assembles intelligence blocks
3. Validates expected vs actual deck context and prompt blocks
4. Produces hard failures (ship blockers) and soft failures (quality)
5. **No model call** — deterministic prompt/state evaluation only

## Seed Scenarios (25)

- state-001 … state-005: state/memory flows
- rules-001 … rules-005: rules/legality
- deck-001 … deck-005: deck intelligence
- contract-001 … contract-005: prompt contract
- adversarial-001 … adversarial-005: adversarial + fuzz

## Limitations / Next Steps

- **Deterministic only** — no live model-backed runs; output traits (`expectedOutputTraits`, `forbiddenOutputTraits`) are not validated
- **Rules bundle** — rules scenarios use fixture bundles when `rulesBundleKey` is set; otherwise `getRulesFactBundle` is called (may hit network)
- **V2 summary** — uses `buildFixtureV2Summary` from fixtures; no live `buildDeckContextSummary` (avoids network)
- **Persistence** — run results are in-memory only; no DB storage
- **Model-backed runs** — can be added later by integrating with existing chat-flow-test or stream route

## Adding New Scenarios

Add entries to `frontend/lib/admin/ai-v2/scenarios/index.ts`:

```ts
{
  id: "my-scenario-id",
  title: "Short title",
  category: "state_memory", // or rules_legality, deck_intelligence, etc.
  description: "What this tests",
  tags: ["tag1", "tag2"],
  turns: [
    {
      userMessage: "User message",
      expectedDeckContext: { hasDeck: true, commanderName: "..." },
      expectedPromptBlocks: ["RULES FACTS"],
      forbiddenPromptBlocks: ["DECK INTELLIGENCE"],
    },
  ],
  initialThread: { decklist_text: "...", commander: "..." },
  rulesBundleKey: "multani", // optional, for deterministic rules
},
```
