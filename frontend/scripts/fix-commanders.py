#!/usr/bin/env python3
"""Fix commander names that were cut off during parsing."""

import json
import sys

fixes = {
    'Tymna the': 'Tymna the Weaver & Thrasios, Triton Hero',
    'Liesa': 'Liesa, Shroud of Dusk',
}

def main():
    if len(sys.argv) < 2:
        print("Usage: python fix-commanders.py <json_file>")
        sys.exit(1)
    
    json_file = sys.argv[1]
    
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    fixed_count = 0
    for tc in data['testCases']:
        old_commander = tc['commander']
        if old_commander in fixes:
            new_commander = fixes[old_commander]
            tc['commander'] = new_commander
            # Fix must_assert that reference the old commander name
            tc['must_assert'] = [
                a.replace(f'must mention {old_commander}', f'must mention {new_commander}')
                for a in tc['must_assert']
            ]
            fixed_count += 1
    
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"Fixed {fixed_count} commander names")

if __name__ == "__main__":
    main()
