# Format Support Mismatch Audit

Last reviewed: 2026-05-11

This audit compares the live codebase against `frontend/docs/format-support-matrix.md`.

## Resolved or no longer current

These items appeared in older notes, but the live code already behaves better now:

1. `cost-to-finish` proxy ignoring `format`
   - Status: resolved
   - Evidence: `frontend/app/api/collections/cost-to-finish/route.ts` forwards `format`
   - Label: previous audit stale

2. `collections/cost` flattening constructed sideboards
   - Status: resolved
   - Evidence: `frontend/lib/collections/costDeckAggregation.ts` uses `parseDeckTextWithZones(...)`
   - Label: previous audit stale

3. Roast missing Pauper support
   - Status: resolved
   - Evidence: `frontend/app/api/deck/roast/route.ts` and `frontend/app/api/mobile/deck/roast-ai/route.ts` both list Pauper in `VALID_FORMATS`
   - Label: previous audit stale

4. Mulligan being Commander-only
   - Status: resolved
   - Evidence: `frontend/lib/mulligan/advice-handler.ts` supports Commander, Modern, Pioneer, Standard, Pauper
   - Label: previous audit stale

## Current mismatches

### 1. Unknown format silently falling back to Commander in deck analysis
- Status: fixed in this pass
- Files:
  - `frontend/app/api/deck/analyze/route.ts`
  - `frontend/lib/deck/formatRules.ts`
- Label: behavior bug, truthfulness
- What changed:
  - unsupported or limited formats now return a clear 400 instead of quietly analyzing as Commander

### 2. Health report silently treating unsupported formats like Commander
- Status: fixed in this pass
- Files:
  - `frontend/app/api/decks/health-report/route.ts`
- Label: behavior bug, truthfulness
- What changed:
  - health report now rejects unsupported / limited formats with a clear message

### 3. Health suggestions could keep going on limited formats
- Status: fixed in this pass
- Files:
  - `frontend/app/api/deck/health-suggestions/route.ts`
- Label: behavior bug, truthfulness
- What changed:
  - route now rejects unsupported / limited formats instead of borrowing first-class assumptions

### 4. UI copy still implied broader Commander-first support than the backend truth
- Status: partially fixed in this pass
- Files:
  - `frontend/components/FormatPickerModal.tsx`
  - `frontend/components/DeckAnalyzerExpandable.tsx`
  - `frontend/components/DeckRoastPanel.tsx`
  - `frontend/app/tools/page.tsx`
  - `frontend/app/tools/mulligan/page.tsx`
- Label: copy/UI mismatch
- What changed:
  - light notes now call out the first-class format set

### 5. Chat inference paths could borrow Commander defaults for explicit limited/unknown formats
- Status: fixed in follow-up pass
- Files:
  - `frontend/app/api/chat/route.ts`
  - `frontend/app/api/chat/stream/route.ts`
  - `frontend/lib/chat/resolve-chat-format.ts`
  - `frontend/lib/prompts/composeSystemPrompt.ts`
- Label: truthfulness
- What changed:
  - explicit limited formats, such as Legacy/Brawl/Historic/Vintage, now use a generic chat prompt layer and a support note instead of Commander layers
  - explicit unrecognized formats now ask for a supported format before format-specific deep analysis
  - first-class formats still use their proper prompt keys: Commander, Modern, Pioneer, Standard, Pauper
  - no-format chat keeps the intentional Commander-first default, including commander confirmation gates, so the tuned Commander flow is preserved

## Still intentionally deferred

These are known follow-ups, but not patched yet in this pass:

1. Public/support-level UI framework
   - Label: copy/UI mismatch
   - Why deferred:
     - we agreed not to add a large visible support-system UI yet

## Recommended next pass

1. Centralize supported-format arrays in more UI components
2. Add small route-level tests for unsupported limited formats
3. Expand limited formats only when the actual tool stack is ready
