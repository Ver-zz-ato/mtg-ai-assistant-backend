# Quick Start: Convert PDF Text to JSON

## Step 1: Save the PDF Text

Save the text you extracted from the PDF to a file, for example `pdf-text.txt`.

## Step 2: Run the Parser

```bash
cd frontend
python scripts/parse-pdf-tests.py pdf-text.txt test-cases.json
```

This will:
- Parse the text file
- Extract all test cases
- Convert them to structured JSON
- Save to `test-cases.json`

## Step 3: Review the Output

Check that you have ≥200 test cases:
```bash
python -c "import json; data=json.load(open('test-cases.json')); print(f'Total: {len(data[\"testCases\"])}')"
```

## Step 4: Import to Database

POST the JSON file to the import API endpoint (you'll need to be logged in as admin):

```bash
# Using curl (you'll need your auth cookie)
curl -X POST http://localhost:3000/api/admin/ai-test/import-pdf \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d @test-cases.json
```

Or use your admin interface if you have one set up.

## Troubleshooting

If the parser doesn't extract enough test cases:
1. Check the text file format - make sure test cases are separated correctly
2. Look at the first extracted test case in the JSON to see if the format is correct
3. Adjust the parser script if needed (the regex patterns might need tweaking for your PDF format)
