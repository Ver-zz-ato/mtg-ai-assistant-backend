# Fetching Real Commander Decks from Moxfield

## Option 1: Manual Curation (Recommended)

1. **Browse Moxfield for popular decks:**
   - Go to https://www.moxfield.com/decks?format=commander&sort=popular
   - Or search for specific commanders: https://www.moxfield.com/decks?q=commander:"Atraxa, Praetors Voice"

2. **Extract deck IDs:**
   - Click on a deck you want to use
   - Copy the deck ID from the URL
   - Example: `https://www.moxfield.com/decks/abc123xyz` → deck ID is `abc123xyz`

3. **Add to JSON file:**
   - Edit `moxfield-deck-ids.json`
   - Add deck IDs to the `deckIds` array
   - Each deck should be a well-built, popular 100-card Commander deck

4. **Run the script:**
   ```bash
   cd backend
   npm install  # Install @supabase/supabase-js if needed
   node scripts/fetch-real-decks.js --curated
   ```

## Option 2: Automated Search (May Not Work)

The script tries to search Moxfield's API automatically, but this may not work if:
- Moxfield doesn't have a public API
- Rate limiting blocks requests
- Terms of Service restrictions

To try automated search:
```bash
node scripts/fetch-real-decks.js
```

## What the Script Does

1. Fetches deck data from Moxfield
2. Validates each deck has exactly 100 cards (99 + commander)
3. Parses the decklist format
4. Inserts into your Supabase database as public decks
5. Skips decks that already exist

## Requirements

- `.env.local` file with:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Expected Output

```
Fetching real decklists from Moxfield...

  ✓ Created: Atraxa, Praetors Voice - Superfriends (100 cards)
  ✓ Created: The Ur-Dragon - Dragon Tribal (100 cards)
  ...

✅ Done! Created 50 decks, skipped 0 commanders.
```

## Troubleshooting

- **"No decks found"**: Moxfield API may not be accessible. Use Option 1 (manual curation).
- **"Invalid deck format"**: Deck doesn't have exactly 100 cards. Skip it.
- **"Already exists"**: Deck with same title already in database. Safe to ignore.
