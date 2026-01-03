# MTGJSON Commander Deck Generator

This script downloads real Commander decks from MTGJSON and exports them to CSV format.

## Usage

```powershell
cd backend
node scripts/generate-commander-decks-from-mtgjson.js
```

## What It Does

1. **Downloads MTGJSON DeckList**: Fetches the complete list of available decks
2. **Filters Commander Decks**: Finds all Commander/EDH format decks
3. **Sorts by Date**: Orders by release date (newest first)
4. **Downloads Individual Decks**: Fetches each deck's full data
5. **Validates**: Ensures each deck has:
   - Exactly 1 commander
   - Exactly 100 cards total
6. **Exports to CSV**: Creates `commander_50_real_decks.csv` with 50 valid decks

## Output Format

The CSV file has 3 columns:
- `title`: Deck name (with set code if needed)
- `commander`: Commander's full name
- `decklist`: Full decklist text (commander first, then 99 cards)

## Requirements

- Node.js with ES modules support
- Internet connection (downloads from MTGJSON)
- `node-fetch` package (already in dependencies)

## Output File

The script creates: `backend/scripts/commander_50_real_decks.csv`

You can then import this CSV using:
```powershell
node scripts/import-decks-from-csv.js scripts/commander_50_real_decks.csv
```

## Notes

- The script skips decks with partner commanders (needs exactly 1)
- Skips decks that don't have exactly 100 cards
- Shows a report of skipped decks and reasons
- Uses rate limiting to avoid overwhelming MTGJSON servers
