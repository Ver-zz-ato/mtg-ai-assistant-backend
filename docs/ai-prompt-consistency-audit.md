# AI Prompt Consistency Audit

**Date:** 2025-01-27  
**Goal:** Ensure all AI card recommendation features use the same improved prompts and quality standards

---

## Executive Summary

✅ **Swap Suggestions** and **Swap Why** already use `deck_analysis` prompt as base  
✅ **Cost to Finish** indirectly benefits (uses swap suggestions API)  
⚠️ **Chat** uses separate prompt - needs enhancement for card recommendations  
✅ **Reprint Risk** uses simple hardcoded prompt (appropriate for its use case)

---

## Current State

### 1. ✅ Swap Suggestions (`/api/deck/swap-suggestions/route.ts`)

**Status:** ✅ **ALREADY USING IMPROVED PROMPTS**

- **Line 138:** Loads `deck_analysis` prompt via `getPromptVersion("deck_analysis")`
- **Lines 146-153:** Adds budget swap mode instructions on top of base prompt
- **Benefit:** Gets all improvements:
  - Synergy-chain requirements
  - Archetype terminology
  - Few-shot examples
  - Minimum length rules

**Code:**
```typescript
let basePrompt = "You are ManaTap AI, an expert Magic: The Gathering assistant.";
try {
  const promptVersion = await getPromptVersion("deck_analysis");
  if (promptVersion) {
    basePrompt = promptVersion.system_prompt;
  }
} catch (e) {
  console.warn("[swap-suggestions] Failed to load prompt version:", e);
}
```

---

### 2. ✅ Swap Why (`/api/deck/swap-why/route.ts`)

**Status:** ✅ **ALREADY USING IMPROVED PROMPTS**

- **Line 26:** Loads `deck_analysis` prompt via `getPromptVersion("deck_analysis")`
- **Lines 34-40:** Adds swap explanation mode instructions
- **Benefit:** Gets all improvements

**Code:**
```typescript
let basePrompt = 'You are ManaTap AI, an expert Magic: The Gathering assistant.';
try {
  const promptVersion = await getPromptVersion('deck_analysis');
  if (promptVersion) {
    basePrompt = promptVersion.system_prompt;
  }
} catch (e) {
  console.warn('[swap-why] Failed to load prompt version:', e);
}
```

---

### 3. ✅ Cost to Finish (`/app/collections/cost-to-finish/Client.tsx`)

**Status:** ✅ **INDIRECTLY BENEFITS**

- Uses swap suggestions API (line 650)
- Calls `/api/deck/swap-suggestions` with `ai: true`
- Therefore gets all improvements through swap suggestions

---

### 4. ⚠️ Chat (`/api/chat/route.ts`)

**Status:** ⚠️ **USES SEPARATE PROMPT - NEEDS ENHANCEMENT**

**Current State:**
- Uses `getPromptVersion("chat")` (line 561) - separate from `deck_analysis`
- Has some synergy guidance (lines 490-493) but not as strict
- Missing:
  - Mandatory synergy-chain requirement
  - Archetype terminology requirement (first 2 sentences)
  - Minimum length rule
  - Detailed synergy explanation format

**Why Separate?**
- Chat has personas (Budget Brewer, Competitive, Teaching Mode)
- Chat handles non-deck questions (rules, general MTG questions)
- Chat is conversational, not always analyzing decks

**Recommendation:**
When chat is recommending cards or analyzing decks, it should apply the same quality standards. However, we should NOT apply all rules globally (e.g., minimum length doesn't make sense for a simple rules question).

**Solution Options:**
1. **Enhance chat prompt** with conditional card recommendation rules
2. **Detect deck analysis context** in chat and inject `deck_analysis` prompt sections
3. **Create shared prompt sections** that both chat and deck_analysis can use

---

### 5. ✅ Reprint Risk (`/api/cards/reprint-risk/route.ts`)

**Status:** ✅ **APPROPRIATE AS-IS**

- Uses simple hardcoded prompt (line 40)
- Purpose: Rate reprint risk, not recommend cards
- No changes needed

---

## Improvements Made to `deck_analysis` Prompt

These improvements are now available to swap-suggestions and swap-why:

### 1. Minimum Length Rule
- Responses must be at least 220 characters
- Prevents overly brief answers

### 2. Mandatory Synergy-Chain Requirement
- Every analysis must include at least one explicit synergy chain
- Format: "Card A does X; Card B reacts to X by doing Y; together they achieve Z"
- Self-check before sending

### 3. Archetype Terminology Requirement
- Must use explicit archetype keywords in first 2 sentences
- Examples: "big mana ramp", "blink engine", "graveyard recursion", "enchantress engines"
- Helps with accurate archetype identification

### 4. Few-Shot Examples
- 6 representative examples (Tokens, Aristocrats, Landfall, Blink, Voltron, Graveyard)
- Demonstrates correct structure and depth

### 5. Enhanced Synergy & Engines Section
- Detailed rules for explaining synergies
- Must name enabler and payoff cards
- Must describe mechanical sequence
- Avoid vague language

---

## Recommendations

### ✅ Immediate Actions (Already Done)
1. ✅ Swap suggestions uses `deck_analysis` prompt
2. ✅ Swap why uses `deck_analysis` prompt
3. ✅ Cost to finish benefits indirectly

### ⚠️ Recommended Actions

#### 1. Enhance Chat Prompt for Card Recommendations

**Option A: Conditional Enhancement (Recommended)**
- Detect when chat is analyzing/recommending cards
- Inject `deck_analysis` synergy/archetype rules into chat prompt dynamically
- Keep chat prompt separate for non-deck questions

**Option B: Shared Prompt Sections**
- Extract synergy/archetype rules into shared sections
- Both `chat` and `deck_analysis` can reference these sections
- Maintains separation while ensuring consistency

**Option C: Full Integration**
- Apply all `deck_analysis` improvements to chat prompt
- Risk: May make chat responses too verbose for simple questions

**Recommendation:** Option A or B - conditional enhancement based on context

#### 2. Create Shared Prompt Library

Extract common rules into reusable sections:
- Synergy explanation format
- Archetype terminology requirements
- Card recommendation quality standards

Both prompts can reference these sections.

---

## Testing Checklist

- [x] Swap suggestions uses `deck_analysis` prompt
- [x] Swap why uses `deck_analysis` prompt
- [x] Cost to finish uses swap suggestions API
- [ ] Chat prompt enhanced for card recommendations (if proceeding)
- [ ] Test swap suggestions with various archetypes
- [ ] Test swap why with various card pairs
- [ ] Test cost to finish with expensive cards
- [ ] Test chat card recommendations match quality of deck_analysis

---

## Files Modified

### Already Using Improved Prompts:
- ✅ `frontend/app/api/deck/swap-suggestions/route.ts`
- ✅ `frontend/app/api/deck/swap-why/route.ts`

### Indirectly Benefits:
- ✅ `frontend/app/collections/cost-to-finish/Client.tsx`

### May Need Updates:
- ⚠️ `frontend/app/api/chat/route.ts` (conditional enhancement recommended)

---

## Conclusion

**Good News:** The main card recommendation features (swap suggestions, swap why, cost to finish) are already using the improved `deck_analysis` prompt, so they benefit from all the recent improvements.

**Action Item:** Consider enhancing the chat prompt for card recommendation scenarios, but keep it flexible for non-deck questions.

