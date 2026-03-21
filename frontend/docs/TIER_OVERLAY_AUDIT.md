# Tier Overlay Architecture — Audit & Implementation Plan

**Scope:** 1 BASE prompt + 3 TIER overlays (Guest, Free, Pro). Prompt content varies by user tier; model selection unchanged.

**Target pages for tier overlay testing:** `/admin/ai-test` and `/admin/chat-test`.

---

## 1. Prompt Build Pipeline (Exact Order)

### 1.1 Chat Stream (`/api/chat/stream`)

| Step | What | File/Location |
|------|------|---------------|
| 1 | **Tier selection** | `classifyPromptTier()` → micro / standard / full |
| 2 | **Base prompt** | micro: `MICRO_PROMPT`; standard: `buildSystemPromptForRequest({ kind: "chat" })`; full: same with deckContext |
| 3 | **buildSystemPromptForRequest** | Tries `composeSystemPrompt()` (prompt_layers), else `getPromptVersion()` (prompt_versions), else hardcoded default |
| 4 | **composeSystemPrompt** | BASE + FORMAT + MODULES (+ DECK_ANALYSIS_EXEMPLARS for deck_analysis) |
| 5 | **sys = promptResult.systemPrompt + NO_FILLER_INSTRUCTION** | `route.ts` ~476 |
| 6 | User preferences (format, budget, colors) | `route.ts` ~516–530 |
| 7 | **getUserLevelInstruction(prefs?.userLevel)** | `route.ts` ~534 |
| 8 | **[OVERLAY INJECTION POINT]** | **AFTER 7, BEFORE 9** |
| 9 | v2 context build, Rules Facts, Commander confirm, Deck Intelligence | `route.ts` ~538–730 |
| 10 | Fingerprint + Recommendation steering | `route.ts` ~732–757 |
| 11 | Cards in deck, Recent conversation | `route.ts` ~759–769 |
| 12 | DECK CONTEXT (linked deck), Few-shot, Raw deck path | `route.ts` ~771–930 |
| 13 | Commander confirmation block, prompt contract | `route.ts` ~858–878 |
| 14 | Thread summary, Pro preferences | `route.ts` ~976–1003 |
| 15 | **Layer 0 gate** | Runs after prompt assembly, before LLM call |
| 16 | Model selection | `getModelForTier({ isGuest, userId, isPro })` → Guest: gpt-4o-mini, Free: gpt-5-mini, Pro: gpt-5.1 |

### 1.2 Deck Analyze (`/api/deck/analyze`)

- Uses `buildSystemPromptForRequest({ kind: "deck_analysis", deckContextForCompose })`
- `deckTierRes = getModelForTier({ isGuest: !user, userId, isPro, useCase: 'deck_analysis' })` at ~1626
- Fingerprint + steering appended if enabled (after system prompt, before planSuggestionSlots)
- **Overlay injection:** after `deckAnalysisSystemPrompt = promptResult.systemPrompt`, before fingerprint. No getUserLevelInstruction in this route.

### 1.3 Non-Stream Chat (`/api/chat`)

- Mirrors stream logic; overlays injected after `getUserLevelInstruction(prefs?.userLevel)` (~1128), before v2/deck blocks
- Used by ai-test single run for chat-type tests

---

## 2. Tier Detection (Guest / Free / Pro)

| Source | Location | How |
|--------|----------|-----|
| **Model tier** | `lib/ai/model-by-tier.ts` | `getModelForTier({ isGuest, userId, isPro })` → `guest` \| `free` \| `pro` |
| **isGuest** | `route.ts` | No user = guest |
| **isPro** | `lib/server-pro-check.ts` | `checkProStatus(userId)` |
| **forceTier (admin)** | `route.ts` ~229–238 | When `sourcePage?.includes("Admin Chat Test")` and `context.forceTier` ∈ { guest, free, pro } → overrides `modelTierRes` |

**Important:** Overlays use **model tier** (`modelTierRes.tier`), not prompt tier (micro/standard/full). Prompt tier controls prompt *size*; model tier controls overlay *content*.

---

## 3. Safe Injection Point

**Exact phrasing:** Inject tier overlays **AFTER** `getUserLevelInstruction(prefs?.userLevel)` and **BEFORE** the v2 context build (Rules Facts, commander confirmation, deck intelligence).

**Why:** Keeps overlay early so the model knows its tier context. Does not interfere with:
- Commander confirmation
- Layer 0
- Fingerprint / recommendation weighting
- Validation / prompt contract

**Micro tier:** Overlays apply only to standard and full. Micro uses `MICRO_PROMPT` only; no overlay.

---

## 4. Compatibility Check

| Component | Status | Notes |
|-----------|--------|-------|
| prompt_layers | ✅ | composeSystemPrompt returns BASE+FORMAT+MODULES; overlay is appended post-compose |
| prompt_versions fallback | ✅ | Same — overlay after getPromptVersion result |
| tid flow | ✅ | Overlay does not depend on thread |
| deckContextForCompose | ✅ | Overlay does not depend on deck |
| raw deck path | ✅ | Overlay injected before raw deck block |
| micro/standard/full | ✅ | Overlay only when selectedTier !== "micro" |

**Risks:**
1. Token creep — overlays should stay short (~50–150 tokens per tier)
2. Order sensitivity — overlay must not contradict user preferences or level

---

## 5. Test Suite Audit

### 5.1 Admin Pages (Target for Tier Overlay Testing)

| Page | Path | Purpose | Current Tier Support |
|------|------|---------|----------------------|
| **AI Test Suite** | `/admin/ai-test` | Run evals, batch, validation, prompt inspector | `forceModel` only; no `forceTier` |
| **Chat Test** | `/admin/chat-test` | Isolated Chat with debug, tier dropdown | `forceTier` (guest/free/pro) → model only |

### 5.2 AI Test Suite (`/admin/ai-test`)

- **Single run:** `POST /api/admin/ai-test/run` → calls `/api/chat` or `/api/deck/analyze`; accepts `forceTier` (guest/free/pro)
- **Compare tiers (single):** UI checkbox — runs same test 3× (guest, free, pro), displays tier comparison
- **Batch:** `POST /api/admin/ai-test/batch` → same; uses `forceModel`, `eval_run_id`; accepts `forceTier` or `runAcrossTiers` (runs each case 3×)
- **Composed prompt:** `GET /api/admin/ai-test/composed-prompt?tier=guest|free|pro` — previews BASE+FORMAT+MODULES+overlay
- **Test cases:** `ai_test_cases` (DB) + `ai_test_cases.json`; `expectedChecks` for validation
- **Eval runs:** `eval_runs`; `prompt_version_id` stored for runs

**Status:** `forceTier` and `runAcrossTiers` implemented. Run and batch pass `forceTier` through to chat/analyze APIs. Composed prompt accepts `?tier=` and includes overlay.

### 5.3 Chat Test (`/admin/chat-test`)

- Uses `Chat` with `forceTier`; passes `context.forceTier` to stream
- Stream route honors `forceTier` for **model** when `sourcePage` includes "Admin Chat Test"
- **Gap:** `forceTier` affects model only. Overlays will use `modelTierRes.tier`, which is already overridden by `forceTier` in this flow — **no change needed** for overlay to follow forceTier on chat-test

### 5.4 Extending Tests for Base + Guest/Free/Pro Overlays

1. **chat-test:** Already passes `forceTier`. Once overlays are wired to `modelTierRes.tier`, chat-test will automatically test overlay per tier.
2. **ai-test:** Add `tier` or `forceTier` to:
   - Single run request body → pass to `/api/chat` and `/api/deck/analyze` (both need to accept `forceTier` in body/context)
   - Batch request body → same
   - Composed prompt API → accept `?tier=guest|free|pro` and include overlay in preview

3. **Validation:** Test cases may need `tier` in `expectedChecks` (e.g. "Pro overlay should encourage deeper analysis") — optional, phase 4.

---

## 6. Implementation Plan

### Phase 1: Introduce Overlays (No Behavior Change)

1. Create `lib/ai/tier-overlays.ts`:
   - `getTierOverlay(tier: "guest" | "free" | "pro"): string`
   - Initially return empty string for all tiers
2. Add injection point in stream route: after `getUserLevelInstruction`, if `selectedTier !== "micro"`, append `getTierOverlay(modelTierRes.tier)`
3. Add same to deck analyze and non-stream chat
4. Log overlay tier in debug (e.g. `streamDebug("tier_overlay", { tier: modelTierRes.tier })`)

### Phase 2: Wire Tier → Overlay Content

1. Define overlay text for guest, free, pro (short, distinct instructions)
2. Implement `getTierOverlay()` with real content
3. Kill-switch: `DISABLE_TIER_OVERLAYS=1` → return `""`

### Phase 3: Extend Test Infrastructure

1. **chat-test:** No code change — already has forceTier; overlay follows modelTierRes
2. **ai-test:** Add `forceTier` to run and batch APIs; pass to chat/analyze
3. **composed-prompt:** Add `?tier=` query param; include overlay in response when provided

### Phase 4: Enable Stricter Behavior Differences (Optional)

1. Add `tier` to test case schema or run options for tier-specific expected checks
2. Consider golden responses per tier for regression testing

---

## 7. Files to Modify

| File | Phase | Change |
|------|-------|--------|
| `lib/ai/tier-overlays.ts` | 1, 2 | New file: `getTierOverlay()` |
| `app/api/chat/stream/route.ts` | 1, 2 | Inject overlay after getUserLevelInstruction |
| `app/api/chat/route.ts` | 1, 2 | Same injection point (if non-stream builds prompt similarly) |
| `app/api/deck/analyze/route.ts` | 1, 2 | Same injection point |
| `app/api/admin/ai-test/run/route.ts` | 3 | Accept `forceTier`, pass to chat/analyze |
| `app/api/admin/ai-test/batch/route.ts` | 3 | Accept `forceTier`, pass to chat/analyze |
| `app/admin/ai-test/page.tsx` | 3 | Tier dropdown / option for run and batch |
| `app/api/admin/ai-test/composed-prompt/route.ts` | 3 | Accept `?tier=`, include overlay |
| `app/admin/chat-test/page.tsx` | — | No change (forceTier already works) |

---

## 8. READY FOR IMPLEMENTATION

All sections above are complete. Proceed with Phase 1 when approved.
