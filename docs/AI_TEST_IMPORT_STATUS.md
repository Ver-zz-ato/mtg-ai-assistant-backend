# AI Test Import Status

## ✅ Completed

1. **Migration to clear old DB tests**: `029_clear_old_ai_tests.sql`
   - Deletes all existing test cases from the database

2. **Import API route**: `/api/admin/ai-test/import-pdf`
   - Accepts structured test cases in PDF format
   - Validates structure (id, title, format, user_prompt required)
   - Validates count (must have ≥200 tests)
   - Clears old DB tests before importing
   - Returns summary (counts by format, counts by tag)
   - Shows warning if < 200 tests

3. **JSON file cleared**: `frontend/lib/data/ai_test_cases.json`
   - Replaced with empty `testCases` array

## ⚠️ Pending: PDF Parsing

The PDF file is located at:
```
frontend/Magic_ The Gathering AI Deck Analysis Test Cases.pdf
```

**Next Steps:**
1. Install PDF parsing library (e.g., `pdf-parse`): `npm install pdf-parse`
2. Create a script to parse the PDF and extract test cases
3. Convert extracted tests to the structured format
4. POST to `/api/admin/ai-test/import-pdf`

**PDF Structure Needed:**
- Identify how tests are formatted in the PDF
- Extract: title, format, commander, user prompt, decklist, tags, focus, must_assert
- Generate stable IDs for each test

## 📋 Test Storage Locations

Tests are stored in **TWO places**:
1. **Database**: `ai_test_cases` table (via Supabase)
2. **JSON file**: `frontend/lib/data/ai_test_cases.json`

The test runner (`/api/admin/ai-test/cases`) loads from BOTH sources.

## 📝 Structured Test Format

```typescript
interface PDFTestCase {
  id: string; // Unique, stable ID
  title: string;
  format: "commander" | "modern" | "standard" | "pioneer" | "other";
  commander: string | null;
  user_prompt: string;
  decklist: string; // Raw multiline string
  tags: string[]; // Failure-class tags
  must_assert: string[]; // Machine-checkable requirements
  focus?: string; // From "Focus:" text in PDF
}
```

## 🔍 Validation Rules

1. **Must have ≥200 tests** - API returns 400 error if < 200
2. **Required fields**: `id`, `title`, `format`, `user_prompt`
3. **Optional fields**: `commander`, `decklist`, `tags`, `must_assert`, `focus`
4. **Format validation**: Checks for missing formats (Modern/Standard)

## 📊 Summary Output

After import, the API returns:
```json
{
  "ok": true,
  "imported_count": 200,
  "expected_count": 200,
  "summary": {
    "total": 200,
    "by_format": {
      "commander": 150,
      "modern": 30,
      "standard": 20
    },
    "by_tag": {
      "COLOR_IDENTITY_OFFCOLOR": 25,
      "CMD_BANNED_CARD_PRESENT": 15,
      ...
    }
  },
  "message": "Successfully imported 200 test cases from PDF"
}
```

## 🎯 Next: Additional Test Cases

After importing the 200 PDF tests, add these edge case tests:

### 1. Commander Color Identity Edge Cases
- Cards with colored activated abilities
- Hybrid mana symbols
- Devoid cards with colored mana symbols in rules text

### 2. MDFCs and Adventure Cards
- Identity comes from all faces
- Adventure cards have two colors

### 3. Format Legality Traps
- Modern: Banned staples that "look fine"
- Standard: Rotation traps

### 4. User-Request Contract Tests
- "Only permanents" → must not suggest instants/sorceries
- "Budget" → must not suggest expensive cards
- Insufficient info → must ask clarifying questions

### 5. Machine-Checkable Assertions
- Regex-based checks
- Not AI-graded
