#!/usr/bin/env python3
"""
Parse the extracted PDF text and convert to structured JSON format.

Usage:
    python parse-pdf-tests.py input.txt output.json
"""

import json
import sys
import re
from typing import List, Dict, Any, Optional

def create_test_case(
    id: str,
    title: str,
    format_type: str,
    commander: Optional[str],
    user_prompt: str,
    decklist: str,
    tags: List[str],
    must_assert: List[str],
    focus: Optional[str]
) -> Dict[str, Any]:
    """Create a structured test case object."""
    return {
        "id": id,
        "title": title,
        "format": format_type.lower(),
        "commander": commander,
        "user_prompt": user_prompt,
        "decklist": decklist.strip(),
        "tags": tags,
        "must_assert": must_assert,
        "focus": focus
    }


def parse_pdf_text(text: str) -> List[Dict[str, Any]]:
    """
    Parse the PDF text format and extract test cases.
    
    Expected format:
    • Title (Format Info) – Format: Commander. Deck (Commander: Name):
    • Card 1
    • Card 2
    ...
    Focus: Description
    """
    test_cases = []
    
    # Split text into sections by test case headers
    # Pattern: • Title – Format: ...
    # We'll split on lines that match this pattern
    lines = text.split('\n')
    
    current_test = None
    current_decklist = []
    current_focus = None
    test_number = 0
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Check if this is a test case header
        # Pattern: • Title (optional) – Format: ...
        if re.match(r'^•\s+.+–\s*Format:', line):
            # Save previous test case if exists
            if current_test is not None:
                test_number += 1
                test_case = build_test_case(current_test, current_decklist, current_focus, test_number)
                test_cases.append(test_case)
            
            # Start new test case
            # Extract title and format info
            # Format: • Title (info) – Format: Commander. Deck (Commander: Name):
            header_match = re.match(r'^•\s+(.+?)\s*–\s*Format:\s*(.+)', line)
            if header_match:
                title_part = header_match.group(1).strip()
                format_part = header_match.group(2).strip()
                
                # Extract title (remove color/mana cost info in parentheses)
                title = re.sub(r'\s*\([^)]+\)\s*$', '', title_part).strip()
                
                # Extract format type
                format_match = re.search(r'\b(Commander|Modern|Standard|Pioneer)\b', format_part, re.I)
                format_type = format_match.group(1).lower() if format_match else "other"
                
                # Extract commander name
                commander_match = re.search(r'Commander:\s*([^)]+)', format_part, re.I)
                commander = commander_match.group(1).strip() if commander_match else None
                # Handle partners (e.g., "Tymna the Weaver & Thrasios, Triton Hero")
                
                current_test = {
                    'title': title,
                    'format': format_type,
                    'commander': commander
                }
                current_decklist = []
                current_focus = None
            else:
                # Malformed header, skip
                current_test = None
        
        elif current_test is not None:
            # We're inside a test case
            if line.startswith('Focus:'):
                # Extract focus text (may span multiple lines)
                focus_lines = [line[6:].strip()]  # Remove "Focus:"
                i += 1
                # Collect continuation lines (until next bullet point or empty line)
                while i < len(lines):
                    next_line = lines[i].strip()
                    if not next_line:
                        break
                    if next_line.startswith('•') and re.match(r'^•\s+.+–\s*Format:', next_line):
                        i -= 1  # Back up to process this as a new test case
                        break
                    if re.match(r'^[A-Z]', next_line) or not next_line.startswith('•'):
                        focus_lines.append(next_line)
                        i += 1
                    else:
                        break
                current_focus = ' '.join(focus_lines).strip()
                continue
            
            elif line.startswith('•'):
                # Card line
                card_line = line[1:].strip()
                if card_line and not re.match(r'^(Format:|Deck)', card_line, re.I):
                    # Clean up card name (remove leading numbers if present)
                    card_line = re.sub(r'^\d+\s*', '', card_line)
                    current_decklist.append(card_line)
            
            elif line and not line.startswith('•'):
                # Might be continuation of focus or other text
                if current_focus and not line.startswith('Format:') and not re.match(r'^[A-Z][a-z]+\s+Format', line):
                    # Append to focus if it looks like descriptive text
                    if not line.startswith('•'):
                        current_focus = (current_focus + ' ' + line).strip()
        
        i += 1
    
    # Don't forget the last test case
    if current_test is not None:
        test_number += 1
        test_case = build_test_case(current_test, current_decklist, current_focus, test_number)
        test_cases.append(test_case)
    
    return test_cases


def build_test_case(test_info: Dict, decklist: List[str], focus: Optional[str], test_number: int) -> Dict[str, Any]:
    """Build a test case object from parsed components."""
    
    title = test_info['title']
    format_type = test_info['format']
    commander = test_info['commander']
    
    # Build decklist string (format: "1 Card Name" per line)
    decklist_lines = []
    for card in decklist:
        if card.strip():
            # Card might already have quantity, or we add "1 "
            if re.match(r'^\d+', card):
                decklist_lines.append(card)
            else:
                decklist_lines.append(f"1 {card}")
    
    decklist_str = '\n'.join(decklist_lines)
    
    # Generate user prompt
    if format_type == "commander":
        user_prompt = "What cards should I add to improve this Commander deck?"
    else:
        user_prompt = f"How can I improve this {format_type.title()} deck?"
    
    # Extract tags and assertions
    tags = []
    must_assert = []
    
    focus_lower = focus.lower() if focus else ""
    decklist_lower = decklist_str.lower()
    
    # Check for color identity issues
    if 'color identity' in focus_lower or 'off-color' in focus_lower or '(illegal' in decklist_lower or 'off-color' in decklist_lower:
        tags.append("COLOR_IDENTITY_OFFCOLOR")
        must_assert.append("must not recommend off-color cards")
        must_assert.append("must flag color identity violations")
    
    # Check for banned cards
    if 'banned' in focus_lower or '(banned)' in decklist_lower:
        tags.append("CMD_BANNED_CARD_PRESENT")
        must_assert.append("must flag banned card if present")
    
    # Check for duplicates
    if 'duplicate' in focus_lower or 'singleton' in focus_lower or '×2' in decklist_lower:
        tags.append("CMD_SINGLETON_VIOLATION")
        must_assert.append("must flag duplicate cards in Commander deck")
    
    # Check for fake cards
    if 'fictional' in focus_lower or 'fictional' in decklist_lower or 'fake' in focus_lower:
        tags.append("FAKE_CARD_BAIT")
    
    # Check for format legality
    if ('format' in focus_lower and 'legal' in focus_lower) or 'not in' in focus_lower or 'rotation' in focus_lower:
        tags.append("FORMAT_LEGALITY_ERROR")
        must_assert.append("must flag cards not legal in format")
    
    # Check for combo recognition
    if 'combo' in focus_lower:
        tags.append("COMBO_RECOGNITION")
        must_assert.append("must identify combo win condition")
    
    # Check for synergy
    if 'synergy' in focus_lower:
        tags.append("SYNERGY_RECOGNITION")
        must_assert.append("must identify key synergies")
    
    # Default assertions
    if commander:
        must_assert.append(f"must mention {commander}")
    
    if decklist_str:
        must_assert.append("must include >=3 legal recommendations")
    
    # Remove duplicates
    tags = list(set(tags))
    must_assert = list(set(must_assert))
    
    # Generate ID
    test_id = f"pdf-test-{test_number:03d}"
    
    return create_test_case(
        id=test_id,
        title=title,
        format_type=format_type,
        commander=commander,
        user_prompt=user_prompt,
        decklist=decklist_str,
        tags=tags,
        must_assert=must_assert,
        focus=focus
    )


def main():
    if len(sys.argv) < 3:
        print("Usage: python parse-pdf-tests.py <input_txt> <output_json>")
        print("\nExample:")
        print("  python parse-pdf-tests.py pdf-extracted-text.txt test-cases.json")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    print(f"Reading from: {input_file}")
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            text = f.read()
    except FileNotFoundError:
        print(f"Error: File not found: {input_file}")
        sys.exit(1)
    
    print("Parsing test cases...")
    test_cases = parse_pdf_text(text)
    
    print(f"Extracted {len(test_cases)} test cases")
    
    if len(test_cases) < 200:
        print(f"WARNING: Only {len(test_cases)} test cases extracted (expected >=200)")
    else:
        print(f"Found {len(test_cases)} test cases (expected >=200)")
    
    # Create output structure
    output = {
        "testCases": test_cases
    }
    
    # Write to JSON file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"\nSaved to: {output_file}")
    
    # Print summary
    formats = {}
    for tc in test_cases:
        fmt = tc.get('format', 'unknown')
        formats[fmt] = formats.get(fmt, 0) + 1
    
    print("\nSummary by format:")
    for fmt, count in sorted(formats.items()):
        print(f"  {fmt}: {count}")
    
    # Print first test case as example
    if test_cases:
        print("\n" + "="*80)
        print("First test case (example):")
        print("="*80)
        # Use ensure_ascii=True for Windows console compatibility
        print(json.dumps(test_cases[0], indent=2, ensure_ascii=True))
    
    print(f"\nNext step: POST {output_file} to /api/admin/ai-test/import-pdf")


if __name__ == "__main__":
    main()
