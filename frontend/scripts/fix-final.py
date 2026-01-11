#!/usr/bin/env python3
import json

fixes = {
    'Tymna the': 'Tymna the Weaver & Thrasios, Triton Hero',
    'Liesa': 'Liesa, Shroud of Dusk',
}

with open('test-cases-final.json', 'r', encoding='utf-8') as f:
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

with open('test-cases-final.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"Fixed {fixed_count} commander names")
