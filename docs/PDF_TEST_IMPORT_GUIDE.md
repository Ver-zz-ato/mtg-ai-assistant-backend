# PDF Test Import Guide

This document explains how to import AI test cases from the PDF file.

## Current Status

✅ **Completed:**
- Migration to clear old DB tests (`029_clear_old_ai_tests.sql`)
- Import API route (`/api/admin/ai-test/import-pdf`) that accepts structured test cases
- Validation for 200 tests requirement
- Summary reporting (format counts, tag counts)

⚠️ **Pending:**
- PDF parsing implementation (requires PDF parsing library)
- Actual extraction of tests from PDF
- JSON file clearing

## Test Storage Locations

Tests are stored in TWO places:
1. **Database**: `ai_test_cases` table (via Supabase)
2. **JSON file**: `frontend/lib/data/ai_test_cases.json`

The test runner loads from BOTH sources (see `/api/admin/ai-test/cases`).

## Structured Test Format

The PDF import expects tests in this format:

```typescript
interface PDFTestCase {
  id: string; // Unique, stable ID
  title: string;
  format: "commander" | "modern" | "standard" | "pioneer" | "other";
  commander: string | null;
  user_prompt: string;
  decklist: string; // Raw multiline string
  tags: string[]; // Failure-class tags (e.g. COLOR_IDENTITY_OFFCOLOR, CMD_BANNED_CARD_PRESENT, etc.)
  must_assert: string[]; // Machine-checkable requirements
  focus?: string; // From "Focus:" text in PDF
}
```

### Tags (Failure-class tags)

Examples:
- `COLOR_IDENTITY_OFFCOLOR` - AI suggests cards outside color identity
- `CMD_BANNED_CARD_PRESENT` - Deck contains banned card
- `FAKE_CARD_BAIT` - AI suggests fake/non-existent cards
- `CMD_SINGLETON_VIOLATION` - Multiple copies in Commander deck
- `NONPERMANENT_WHEN_PERMANENTS_REQUESTED` - AI suggests instants/sorceries when user asked for permanents only
- `FORMAT_LEGALITY_ERROR` - Suggests cards illegal in format
- `BUDGET_VIOLATION` - Suggests expensive cards when budget requested

### Must Assert (Machine-checkable requirements)

Examples:
- `"must mention commander name"` - Response must mention the commander
- `"must flag banned card if present"` - Response must flag if banned card in deck
- `"must include ≥3 legal recommendations"` - Response must have at least 3 card suggestions
- `"must include synergy chain template"` - Response must follow synergy explanation format
- `"must not recommend off-color cards"` - Response must not suggest cards outside color identity

## How to Import

### Step 1: Parse PDF

You'll need to parse the PDF file at:
```
frontend/Magic_ The Gathering AI Deck Analysis Test Cases.pdf
```

Recommended libraries:
- `pdf-parse` (Node.js)
- `pdfjs-dist` (browser/Node.js)
- Python with `PyPDF2` or `pdfplumber`

### Step 2: Extract Test Cases

Parse the PDF text and extract test cases according to the PDF structure.

### Step 3: Convert to Structured Format

Convert each test case to the `PDFTestCase` format above.

### Step 4: Clear Old Tests

**Database:**
```sql
-- Run migration
-- Or use API: DELETE /api/admin/ai-test/cases?all=true
```

**JSON file:**
Manually replace `frontend/lib/data/ai_test_cases.json` with:
```json
{
  "testCases": []
}
```

### Step 5: Import via API

POST to `/api/admin/ai-test/import-pdf`:

```json
{
  "testCases": [
    {
      "id": "test-1",
      "title": "Test Case Title",
      "format": "commander",
      "commander": "Atraxa, Praetors' Voice",
      "user_prompt": "What should I add to this deck?",
      "decklist": "1 Atraxa, Praetors' Voice\n1 Sol Ring\n...",
      "tags": ["COLOR_IDENTITY_OFFCOLOR"],
      "must_assert": ["must mention commander name", "must include ≥3 legal recommendations"],
      "focus": "Color identity validation"
    },
    // ... 199 more test cases
  ]
}
```

### Step 6: Verify

The API will return:
- `imported_count`: Number of tests imported
- `expected_count`: 200
- `summary.by_format`: Counts per format
- `summary.by_tag`: Counts per tag
- `warning`: If < 200 tests

## Validation Rules

1. **Must have ≥200 tests** - API returns 400 error if < 200
2. **All tests must have**: `id`, `title`, `format`, `user_prompt`
3. **Optional fields**: `commander`, `decklist`, `tags`, `must_assert`, `focus`

## Next Steps: Additional Test Cases

After importing the 200 PDF tests, add these additional test cases:

1. **Commander color identity edge cases**
   - Cards with colored activated abilities
   - Hybrid mana symbols
   - Devoid cards with colored mana symbols

2. **MDFCs and Adventure cards**
   - Identity comes from all faces

3. **Format legality traps**
   - Modern: Banned staples that "look fine"
   - Standard: Rotation traps

4. **User-request contract tests**
   - "Only permanents" → must not suggest instants/sorceries
   - "Budget" → must not suggest expensive cards
   - Insufficient info → must ask clarifying questions

5. **Machine-checkable assertions**
   - Regex-based checks
   - Not AI-graded
