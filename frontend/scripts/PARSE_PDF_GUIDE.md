# How to Structure PDF Test Cases - Step by Step Guide

## Step 2: Convert Parsed PDF Data to Structured Format

After parsing the PDF with pdfplumber, you need to convert the raw text into structured JSON.

## The Structure You Need

Each test case must have this structure:

```json
{
  "id": "pdf-test-001",
  "title": "Commander Color Identity Test - Atraxa",
  "format": "commander",
  "commander": "Atraxa, Praetors' Voice",
  "user_prompt": "What cards should I add to improve this deck?",
  "decklist": "1 Atraxa, Praetors' Voice\n1 Sol Ring\n1 Command Tower",
  "tags": ["COLOR_IDENTITY_OFFCOLOR"],
  "must_assert": [
    "must mention Atraxa, Praetors' Voice",
    "must include ≥3 legal recommendations"
  ],
  "focus": "Color identity validation"
}
```

## Required Fields

- **`id`**: Unique identifier (e.g., "pdf-test-001", "pdf-test-002", ...)
- **`title`**: Short descriptive title
- **`format`**: One of: `"commander"`, `"modern"`, `"standard"`, `"pioneer"`, `"other"`
- **`user_prompt`**: The user's question/request (required)

## Optional Fields

- **`commander`**: Commander name (for Commander format) or `null`
- **`decklist`**: Raw decklist text (multiline string, can be empty)
- **`tags`**: Array of failure-class tags (e.g., `["COLOR_IDENTITY_OFFCOLOR", "CMD_BANNED_CARD_PRESENT"]`)
- **`must_assert`**: Array of machine-checkable requirements
- **`focus`**: Description of what this test focuses on

## Example: Manual Conversion

Let's say your parsed PDF text looks like this:

```
Test Case 1
Format: Commander
Commander: Atraxa, Praetors' Voice
Prompt: What should I add to this deck?
Focus: Color identity
Decklist:
1 Atraxa, Praetors' Voice
1 Sol Ring
1 Command Tower
```

Convert it to:

```json
{
  "id": "pdf-test-001",
  "title": "Commander Color Identity Test - Atraxa",
  "format": "commander",
  "commander": "Atraxa, Praetors' Voice",
  "user_prompt": "What should I add to this deck?",
  "decklist": "1 Atraxa, Praetors' Voice\n1 Sol Ring\n1 Command Tower",
  "tags": ["COLOR_IDENTITY_OFFCOLOR"],
  "must_assert": [
    "must mention Atraxa, Praetors' Voice",
    "must include ≥3 legal recommendations"
  ],
  "focus": "Color identity"
}
```

## How to Do It

### Option 1: Manual (For Understanding)

1. Open your parsed PDF text
2. For each test case, identify:
   - Format (Commander/Modern/Standard/Pioneer)
   - Commander name (if Commander format)
   - User prompt/question
   - Decklist (if present)
   - Tags (from "Focus:" or test description)
   - Assertions (what should the AI do/not do)
3. Convert one test case manually to JSON
4. Use that as a template for writing a script

### Option 2: Python Script (Recommended)

1. Modify `convert-pdf-tests.py` based on your PDF structure
2. The script has template code showing how to parse common patterns
3. Adjust the regex patterns to match your PDF format
4. Run: `python convert-pdf-tests.py input.txt output.json`

### Option 3: Use Python Directly

```python
import pdfplumber
import json

test_cases = []

with pdfplumber.open('Magic_ The Gathering AI Deck Analysis Test Cases.pdf') as pdf:
    text = '\n'.join(page.extract_text() for page in pdf.pages)
    
    # TODO: Parse text into test cases
    # This depends on how your PDF is structured
    
    # For each test case, create a dict:
    test_case = {
        "id": f"pdf-test-{i:03d}",
        "title": "...",
        "format": "commander",  # or "modern", "standard", etc.
        "commander": "...",  # or None
        "user_prompt": "...",
        "decklist": "...",  # multiline string or ""
        "tags": [...],
        "must_assert": [...],
        "focus": "..."  # optional
    }
    test_cases.append(test_case)

# Save to JSON
with open('test-cases.json', 'w') as f:
    json.dump({"testCases": test_cases}, f, indent=2)
```

## Common Tags

- `COLOR_IDENTITY_OFFCOLOR` - AI suggests cards outside color identity
- `CMD_BANNED_CARD_PRESENT` - Deck contains banned card
- `FAKE_CARD_BAIT` - AI suggests fake cards
- `CMD_SINGLETON_VIOLATION` - Multiple copies in Commander
- `FORMAT_LEGALITY_ERROR` - Suggests illegal cards
- `BUDGET_VIOLATION` - Suggests expensive cards when budget requested

## Common Must Assert Patterns

- `"must mention {commander name}"` - Response must mention the commander
- `"must flag banned card if present"` - Must flag banned cards
- `"must include ≥3 legal recommendations"` - Must suggest at least 3 cards
- `"must not recommend off-color cards"` - Must not suggest cards outside color identity
- `"must include synergy chain template"` - Must follow synergy format

## Final Output Format

The final JSON file should look like:

```json
{
  "testCases": [
    {
      "id": "pdf-test-001",
      "title": "...",
      "format": "commander",
      ...
    },
    {
      "id": "pdf-test-002",
      ...
    },
    ... (at least 200 test cases)
  ]
}
```

## Next Steps

1. **First**: Manually convert 1-2 test cases to understand the structure
2. **Then**: Write/modify the Python script to automate conversion
3. **Finally**: Run the script and verify you have ≥200 test cases
4. **Import**: POST the JSON to `/api/admin/ai-test/import-pdf`

## Need Help?

If you're stuck, share:
- A sample of your parsed PDF text (1-2 test cases)
- How the PDF structures the test cases (headers, sections, etc.)
- What you've tried so far

Then I can help you write the specific parsing logic for your PDF format.
