# CSV Import Guide

## Quick Start

1. **Create a CSV file** with your deck data
2. **Run the import script:**
   ```powershell
   cd backend
   node scripts/import-decks-from-csv.js path/to/your/decks.csv
   ```

## CSV Format Options

The script is flexible and supports multiple CSV formats:

### Format 1: Simple (Title, Commander, Decklist)
```csv
title,commander,decklist
Atraxa Counters,Atraxa Praetors' Voice,"Atraxa, Praetors' Voice
1 Sol Ring
1 Arcane Signet
..."
```

### Format 2: Line-by-Line (Each card in a column)
```csv
title,commander,card1,card2,card3,...
Atraxa Counters,Atraxa Praetors' Voice,"1 Sol Ring","1 Arcane Signet","1 Command Tower",...
```

### Format 3: Deck Text Column
```csv
title,commander,deck_text
Atraxa Counters,Atraxa Praetors' Voice,"Atraxa, Praetors' Voice
1 Sol Ring
1 Arcane Signet
..."
```

## Requirements

- Each deck must have exactly **100 cards total** (99 + 1 commander)
- Commander should be on the first line of the decklist, or in a separate `commander` column
- Card format: `1 Card Name` or just `Card Name` (quantity defaults to 1)

## Example CSV

```csv
title,commander,decklist
Atraxa Counters,Atraxa Praetors' Voice,"Atraxa, Praetors' Voice
1 Sol Ring
1 Arcane Signet
1 Command Tower
1 Path of Ancestry
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Forbidden Orchard
1 Exotic Orchard
1 Command Tower
1 Path of Ancestry
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Forbidden Orchard
1 Exotic Orchard
1 Command Tower
1 Path of Ancestry
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Forbidden Orchard
1 Exotic Orchard
1 Command Tower
1 Path of Ancestry
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Forbidden Orchard
1 Exotic Orchard
1 Command Tower
1 Path of Ancestry
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Forbidden Orchard
1 Exotic Orchard
1 Command Tower
1 Path of Ancestry
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Forbidden Orchard
1 Exotic Orchard
1 Command Tower
1 Path of Ancestry
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Forbidden Orchard
1 Exotic Orchard
1 Command Tower
1 Path of Ancestry
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Forbidden Orchard
1 Exotic Orchard
1 Command Tower
1 Path of Ancestry
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Forbidden Orchard
1 Exotic Orchard
1 Command Tower
1 Path of Ancestry
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Forbidden Orchard
1 Exotic Orchard
1 Command Tower
1 Path of Ancestry
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Forbidden Orchard
1 Exotic Orchard
1 Command Tower
1 Path of Ancestry
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Forbidden Orchard
1 Exotic Orchard
1 Command Tower
1 Path of Ancestry
1 Reflecting Pool
1 Mana Confluence
1 City of Brass
1 Forbidden Orchard"
```

## Notes

- The script will skip decks that don't have exactly 100 cards
- Duplicate decks (same title) will be skipped
- Empty lines and comments (starting with # or //) are ignored
- The script automatically detects column names (case-insensitive)
