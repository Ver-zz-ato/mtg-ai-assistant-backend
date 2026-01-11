#!/usr/bin/env python3
"""
Convert parsed PDF test cases to structured JSON format for import.

This script takes the raw text/data extracted from the PDF and converts it
to the structured format required by the import API.

Usage:
    python convert-pdf-tests.py input.txt output.json
    
Or modify this script to read directly from pdfplumber output.
"""

import json
import sys
import re
from typing import List, Dict, Any

# This is the structure each test case needs to have
def create_test_case(
    id: str,
    title: str,
    format: str,  # "commander", "modern", "standard", "pioneer", "other"
    user_prompt: str,
    commander: str = None,
    decklist: str = "",
    tags: List[str] = None,
    must_assert: List[str] = None,
    focus: str = None
) -> Dict[str, Any]:
    """Create a structured test case object."""
    return {
        "id": id,
        "title": title,
        "format": format.lower(),
        "commander": commander,
        "user_prompt": user_prompt,
        "decklist": decklist.strip() if decklist else "",
        "tags": tags or [],
        "must_assert": must_assert or [],
        "focus": focus
    }


def extract_test_cases_from_text(text: str) -> List[Dict[str, Any]]:
    """
    Extract test cases from parsed PDF text.
    
    YOU NEED TO MODIFY THIS FUNCTION based on how your PDF is structured.
    
    This is a template - you'll need to adjust the parsing logic based on
    how the test cases are formatted in your PDF.
    
    Common PDF structures might be:
    - Each test case separated by headers/titles
    - Sections with "Format:", "Commander:", "Prompt:", etc.
    - Numbered or bulleted lists
    """
    test_cases = []
    
    # EXAMPLE: If your PDF has sections like:
    # "Test Case 1: Commander Deck Analysis"
    # "Format: Commander"
    # "Commander: Atraxa, Praetors' Voice"
    # "Prompt: What should I add to this deck?"
    # "Decklist: ..."
    # 
    # You would parse it like:
    
    # Split by test case markers (adjust this pattern to match your PDF)
    # sections = re.split(r'Test Case \d+:', text)
    # 
    # for i, section in enumerate(sections[1:], 1):  # Skip first empty section
    #     # Extract format
    #     format_match = re.search(r'Format:\s*(\w+)', section, re.I)
    #     format_type = format_match.group(1).lower() if format_match else "other"
    #     
    #     # Extract commander (if present)
    #     commander_match = re.search(r'Commander:\s*([^\n]+)', section, re.I)
    #     commander = commander_match.group(1).strip() if commander_match else None
    #     
    #     # Extract prompt
    #     prompt_match = re.search(r'Prompt:\s*([^\n]+)', section, re.I)
    #     prompt = prompt_match.group(1).strip() if prompt_match else ""
    #     
    #     # Extract decklist (might be multiline)
    #     decklist_match = re.search(r'Decklist:\s*(.*?)(?=\n\n|\n[A-Z]|\Z)', section, re.DOTALL | re.I)
    #     decklist = decklist_match.group(1).strip() if decklist_match else ""
    #     
    #     # Extract focus/tags if present
    #     focus_match = re.search(r'Focus:\s*([^\n]+)', section, re.I)
    #     focus = focus_match.group(1).strip() if focus_match else None
    #     
    #     # Generate stable ID
    #     test_id = f"pdf-test-{i:03d}"
    #     
    #     # Extract title (first line or generate from format/commander)
    #     title = f"{format_type.title()} Test Case {i}"
    #     if commander:
    #         title = f"{commander} - {title}"
    #     
    #     # Build must_assert based on common patterns
    #     must_assert = []
    #     if commander:
    #         must_assert.append(f"must mention {commander}")
    #     if decklist:
    #         must_assert.append("must include ≥3 legal recommendations")
    #     
    #     # Build tags based on content
    #     tags = []
    #     if focus:
    #         tags.append(focus.upper().replace(" ", "_"))
    #     
    #     test_case = create_test_case(
    #         id=test_id,
    #         title=title,
    #         format=format_type,
    #         commander=commander,
    #         user_prompt=prompt,
    #         decklist=decklist,
    #         tags=tags,
    #         must_assert=must_assert,
    #         focus=focus
    #     )
    #     
    #     test_cases.append(test_case)
    
    # For now, return empty list - you need to implement the parsing logic
    return test_cases


def load_pdf_text(filepath: str) -> str:
    """Load text from a file (or you can modify to load from pdfplumber directly)."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()


def main():
    """
    Main function.
    
    Option 1: Read from file
        python convert-pdf-tests.py input.txt output.json
    
    Option 2: Use pdfplumber directly (uncomment and modify):
        import pdfplumber
        with pdfplumber.open('Magic_ The Gathering AI Deck Analysis Test Cases.pdf') as pdf:
            text = '\n'.join(page.extract_text() for page in pdf.pages)
            test_cases = extract_test_cases_from_text(text)
    """
    
    if len(sys.argv) < 3:
        print("Usage: python convert-pdf-tests.py <input_file> <output_json>")
        print("\nExample:")
        print("  python convert-pdf-tests.py parsed_pdf.txt test-cases.json")
        print("\nOr modify this script to use pdfplumber directly:")
        print("  import pdfplumber")
        print("  with pdfplumber.open('Magic_ The Gathering AI Deck Analysis Test Cases.pdf') as pdf:")
        print("      text = '\\n'.join(page.extract_text() for page in pdf.pages)")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    # Load the parsed text
    text = load_pdf_text(input_file)
    
    # Extract test cases
    print(f"Parsing test cases from {input_file}...")
    test_cases = extract_test_cases_from_text(text)
    
    print(f"Extracted {len(test_cases)} test cases")
    
    if len(test_cases) < 200:
        print(f"WARNING: Only {len(test_cases)} test cases extracted (expected ≥200)")
    
    # Create the output structure
    output = {
        "testCases": test_cases
    }
    
    # Write to JSON file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Saved {len(test_cases)} test cases to {output_file}")
    print(f"\nNext step: POST this JSON to /api/admin/ai-test/import-pdf")
    
    # Print summary
    formats = {}
    for tc in test_cases:
        fmt = tc.get('format', 'unknown')
        formats[fmt] = formats.get(fmt, 0) + 1
    
    print("\nSummary by format:")
    for fmt, count in sorted(formats.items()):
        print(f"  {fmt}: {count}")


# Example of what a single test case should look like:
EXAMPLE_TEST_CASE = {
    "id": "pdf-test-001",
    "title": "Commander Color Identity Test - Atraxa",
    "format": "commander",
    "commander": "Atraxa, Praetors' Voice",
    "user_prompt": "What cards should I add to improve this deck?",
    "decklist": "1 Atraxa, Praetors' Voice\n1 Sol Ring\n1 Command Tower\n...",
    "tags": ["COLOR_IDENTITY_OFFCOLOR"],
    "must_assert": [
        "must mention Atraxa, Praetors' Voice",
        "must include ≥3 legal recommendations",
        "must not recommend off-color cards"
    ],
    "focus": "Color identity validation"
}


if __name__ == "__main__":
    main()
