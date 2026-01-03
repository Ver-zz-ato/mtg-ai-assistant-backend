# How to Run the Deck Fetching Script

## Step 1: Navigate to the correct directory

From the project root (not inside `frontend`):

```bash
cd backend
```

## Step 2: Install dependencies (if needed)

```bash
npm install
```

This will install `@supabase/supabase-js` if it's not already installed.

## Step 3: Add Moxfield deck IDs

Edit `backend/scripts/moxfield-deck-ids.json` and add real deck IDs:

```json
{
  "deckIds": [
    "abc123xyz",
    "def456uvw",
    "ghi789rst"
  ]
}
```

**How to find deck IDs:**
1. Go to https://www.moxfield.com/decks?format=commander&sort=popular
2. Click on a deck you want
3. Copy the ID from the URL: `https://www.moxfield.com/decks/abc123xyz` → ID is `abc123xyz`

## Step 4: Run the script

```bash
node scripts/fetch-real-decks.js --curated
```

The script will:
- Fetch each deck from Moxfield
- Validate it has exactly 100 cards
- Insert into your database
- Skip duplicates

## Troubleshooting

**"Cannot find module"**: Make sure you're in the `backend` directory, not `frontend/backend`

**"No deck IDs found"**: Add deck IDs to `moxfield-deck-ids.json`

**"Invalid format"**: Some decks may not be exactly 100 cards - they'll be skipped
