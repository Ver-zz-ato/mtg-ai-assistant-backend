# CSV Format Specification

## Required Format

Your CSV file needs **3 columns** per deck:

### Column 1: `title`
- The deck name/title
- Example: `"Atraxa +1/+1 Counters"` or `"The Ur-Dragon Tribal"`

### Column 2: `commander`
- The commander's full name
- Example: `"Atraxa, Praetors' Voice"` or `"The Ur-Dragon"`

### Column 3: `decklist`
- The full decklist as text (with newlines)
- **First line must be the commander name**
- Then 99 cards, one per line
- Format: `"1 Card Name"` or just `"Card Name"` (quantity defaults to 1)
- **Must total exactly 100 cards** (1 commander + 99 other cards)

## Example CSV Structure

```csv
title,commander,decklist
"Deck Name 1","Commander Name 1","Commander Name 1
1 Card One
1 Card Two
1 Card Three
...
(99 cards total)"
"Deck Name 2","Commander Name 2","Commander Name 2
1 Card One
1 Card Two
..."
```

## Important Rules

1. **100 Cards Total**: Each deck must have exactly 100 cards (1 commander + 99 others)
2. **Commander First**: The commander must be the first line in the decklist column
3. **Quotes**: Use double quotes around fields that contain commas or newlines
4. **Card Format**: 
   - `"1 Sol Ring"` (with quantity)
   - `"Sol Ring"` (quantity defaults to 1)
5. **No Empty Lines**: Empty lines in the decklist are ignored

## Minimal Example

```csv
title,commander,decklist
"Test Deck","Atraxa, Praetors' Voice","Atraxa, Praetors' Voice
1 Sol Ring
1 Arcane Signet
1 Command Tower
(96 more cards...)
1 Last Card"
```

## How to Export from Moxfield

1. Go to your deck on Moxfield
2. Click "Export" 
3. Copy the decklist text
4. Paste it into the `decklist` column (make sure commander is first line)
5. Add `title` and `commander` columns

## Quick Template

```csv
title,commander,decklist
"Your Deck Name","Your Commander Name","Your Commander Name
1 First Card
1 Second Card
(continue for 99 cards total)"
```

The script will validate that each deck has exactly 100 cards before importing!
