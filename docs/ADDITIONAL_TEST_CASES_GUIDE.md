# Additional AI Test Cases Guide

After importing the 200 PDF tests, add these edge case tests to cover gaps:

## 1. Commander Color Identity Edge Cases

### Cards with Colored Activated Abilities
**Problem**: AI might miss that cards like `Reaper King` have colored activated abilities that affect color identity.

**Test Cases Needed:**
- Card with hybrid mana in activated ability
- Card with colored mana symbol in reminder text
- Card that "looks" colorless but has colored identity

**Example Tags:**
- `COLOR_IDENTITY_ACTIVATED_ABILITY`
- `COLOR_IDENTITY_REMINDER_TEXT`

### Hybrid Mana Symbols
**Problem**: Hybrid mana symbols (e.g., `{W/U}`, `{2/B}`) can confuse AI about color identity.

**Test Cases Needed:**
- Commander with hybrid mana (e.g., `Sen Triplets`)
- Card suggestions that use hybrid mana incorrectly

**Example Tags:**
- `COLOR_IDENTITY_HYBRID_MANA`

### Devoid Cards
**Problem**: Devoid cards like `Thought-Knot Seer` are colorless but have colored mana symbols that affect color identity.

**Test Cases Needed:**
- Devoid cards with colored mana symbols
- AI suggesting devoid cards outside color identity

**Example Tags:**
- `COLOR_IDENTITY_DEVOID`

## 2. MDFCs and Adventure Cards

**Problem**: MDFCs (Modal Double-Faced Cards) and Adventure cards have identity from all faces/adventure costs.

**Test Cases Needed:**
- MDFC with different colors on each face
- Adventure card with colored adventure cost
- AI missing color identity from second face/adventure

**Example Tags:**
- `COLOR_IDENTITY_MDFC`
- `COLOR_IDENTITY_ADVENTURE`

## 3. Format Legality Traps

### Modern: Banned Staples
**Problem**: Cards like `Splinter Twin`, `Birthing Pod` are commonly played in Commander but banned in Modern.

**Test Cases Needed:**
- Modern deck with banned staple that "looks fine"
- AI suggesting banned cards without flagging them

**Example Tags:**
- `FORMAT_LEGALITY_BANNED_MODERN`
- `BANNED_CARD_NOT_FLAGGED`

### Standard: Rotation Traps
**Problem**: Cards that rotated out of Standard but are still played elsewhere.

**Test Cases Needed:**
- Standard deck with rotated cards
- AI suggesting rotated cards without flagging

**Example Tags:**
- `FORMAT_LEGALITY_ROTATED`
- `STANDARD_ROTATION_TRAP`

## 4. User-Request Contract Tests

### "Only Permanents" Request
**Problem**: User asks for permanents only, AI suggests instants/sorceries.

**Test Cases:**
```typescript
{
  id: "user-contract-permanents-only",
  title: "User requests permanents only - must not suggest instants/sorceries",
  format: "commander",
  commander: "Atraxa, Praetors' Voice",
  user_prompt: "I want to build a permanents-only deck. What should I add?",
  decklist: "1 Atraxa, Praetors' Voice\n...",
  tags: ["NONPERMANENT_WHEN_PERMANENTS_REQUESTED"],
  must_assert: [
    "must not recommend instant spells",
    "must not recommend sorcery spells",
    "must only suggest permanent cards (creatures, artifacts, enchantments, planeswalkers, lands)"
  ]
}
```

### "Budget" Request
**Problem**: User asks for budget options, AI suggests expensive cards.

**Test Cases:**
```typescript
{
  id: "user-contract-budget",
  title: "User requests budget - must not suggest expensive cards",
  format: "commander",
  commander: "Atraxa, Praetors' Voice",
  user_prompt: "I'm on a budget. What should I add to this deck?",
  decklist: "...",
  tags: ["BUDGET_VIOLATION"],
  must_assert: [
    "must not recommend Mana Crypt",
    "must not recommend Rhystic Study",
    "must not recommend cards over $20",
    "must suggest budget-friendly alternatives"
  ]
}
```

### Insufficient Info
**Problem**: User provides insufficient info, AI should ask clarifying questions (not hallucinate).

**Test Cases:**
```typescript
{
  id: "user-contract-insufficient-info",
  title: "Insufficient info - must ask clarifying questions",
  format: "commander",
  commander: null,
  user_prompt: "What should I add?",
  decklist: "",
  tags: ["INSUFFICIENT_INFO"],
  must_assert: [
    "must ask about format",
    "must ask about commander",
    "must not hallucinate a commander",
    "must not suggest cards without context"
  ]
}
```

## 5. Machine-Checkable Assertions

All assertions should be machine-checkable (regex-based), not AI-graded.

### Assertion Patterns

**Must Mention:**
- `"must mention {text}"` → Check if response contains text (case-insensitive)

**Must Not Recommend:**
- `"must not recommend {card}"` → Check if response does NOT contain card name

**Must Flag:**
- `"must flag {issue}"` → Check if response mentions issue

**Must Include (Count):**
- `"must include ≥{N} {items}"` → Count occurrences of items in response

**Must Match Pattern:**
- `"must match {regex}"` → Run regex against response

### Example Implementation

```typescript
function validateAssertion(response: string, assertion: string): boolean {
  const lowerResponse = response.toLowerCase();
  
  if (assertion.includes("must mention")) {
    const match = assertion.match(/must mention (.+)/i);
    if (match) {
      return lowerResponse.includes(match[1].toLowerCase());
    }
  }
  
  if (assertion.includes("must not recommend") || assertion.includes("must not suggest")) {
    const match = assertion.match(/must not (?:recommend|suggest) (.+)/i);
    if (match) {
      return !lowerResponse.includes(match[1].toLowerCase());
    }
  }
  
  if (assertion.includes("must flag")) {
    const match = assertion.match(/must flag (.+)/i);
    if (match) {
      return lowerResponse.includes(match[1].toLowerCase());
    }
  }
  
  if (assertion.includes("≥") || assertion.includes(">=")) {
    const match = assertion.match(/must include ≥(\d+) (.+)/i);
    if (match) {
      const count = parseInt(match[1], 10);
      const item = match[2].toLowerCase();
      const occurrences = (lowerResponse.match(new RegExp(item, 'g')) || []).length;
      return occurrences >= count;
    }
  }
  
  // Add more patterns as needed
  return false;
}
```

## Test Case Template

```typescript
{
  id: "unique-stable-id",
  title: "Descriptive test case title",
  format: "commander" | "modern" | "standard" | "pioneer",
  commander: "Commander Name" | null,
  user_prompt: "User's question or prompt",
  decklist: "1 Card Name\n1 Another Card\n...", // Optional for chat tests
  tags: [
    "COLOR_IDENTITY_OFFCOLOR",
    "CMD_BANNED_CARD_PRESENT",
    "FAKE_CARD_BAIT",
    "CMD_SINGLETON_VIOLATION",
    "NONPERMANENT_WHEN_PERMANENTS_REQUESTED",
    "FORMAT_LEGALITY_ERROR",
    "BUDGET_VIOLATION",
    "INSUFFICIENT_INFO",
    // ... add more as needed
  ],
  must_assert: [
    "must mention commander name",
    "must flag banned card if present",
    "must include ≥3 legal recommendations",
    "must include synergy chain template",
    "must not recommend off-color cards",
    // ... add more as needed
  ],
  focus: "Optional focus text from PDF"
}
```

## Adding Tests

To add these tests:

1. **Create test cases** in the structured format above
2. **POST to `/api/admin/ai-test/import`** (for individual tests)
3. **Or bulk import** via `/api/admin/ai-test/import-pdf` (for batch)

The import API will:
- Validate structure
- Convert to database format
- Store in `ai_test_cases` table
- Generate summary report
