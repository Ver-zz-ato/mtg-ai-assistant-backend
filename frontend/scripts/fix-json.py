#!/usr/bin/env python3
import json
import re

with open('test-cases.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Fix commander names - remove trailing ) and fix known issues
fixes = {
    'Tymna the': 'Tymna the Weaver & Thrasios, Triton Hero',
    'Liesa,': 'Liesa, Shroud of Dusk',
}

for tc in data['testCases']:
    # Remove trailing ) from commander names
    if tc['commander'] and tc['commander'].endswith(')'):
        tc['commander'] = tc['commander'][:-1].strip()
    
    # Apply manual fixes
    old_cmd = tc['commander']
    if old_cmd in fixes:
        tc['commander'] = fixes[old_cmd]
        # Update must_assert
        tc['must_assert'] = [
            a.replace(f'must mention {old_cmd}', f'must mention {fixes[old_cmd]}')
            for a in tc['must_assert']
        ]
    
    # Clean up focus text (remove duplicate sentences)
    if tc.get('focus'):
        sentences = re.split(r'\.\s+', tc['focus'])
        seen = set()
        unique = []
        for s in sentences:
            s_clean = s.strip()
            if s_clean and s_clean not in seen:
                seen.add(s_clean)
                unique.append(s_clean)
        tc['focus'] = '. '.join(unique)
        if tc['focus'] and not tc['focus'].endswith('.'):
            tc['focus'] += '.'

with open('test-cases.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"Fixed {len(data['testCases'])} test cases")
print(f"Total: {len(data['testCases'])} test cases")
