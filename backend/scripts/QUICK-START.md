# Quick Start: Fetch Real Decks from Moxfield

## Prerequisites

Make sure you have a `.env.local` file with Supabase credentials. The script will look for it in:
- `frontend/.env.local` (most common)
- Project root `.env.local`
- `backend/scripts/.env.local`

Required variables:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Correct Commands (from project root):

```powershell
# You're currently in: C:\Users\davy_\mtg_ai_assistant\frontend
# You need to be in: C:\Users\davy_\mtg_ai_assistant\backend

cd ..\backend
npm install
node scripts/fetch-real-decks.js --curated
```

## What You Need to Do:

1. **Find Moxfield deck IDs:**
   - Go to https://www.moxfield.com/decks?format=commander&sort=popular
   - Click on decks you want (make sure they're 100-card Commander decks)
   - Copy the deck ID from URL: `https://www.moxfield.com/decks/abc123xyz` → ID is `abc123xyz`

2. **Add to JSON file:**
   - Edit `backend/scripts/moxfield-deck-ids.json`
   - Replace the example with real IDs:
   ```json
   {
     "deckIds": [
       "abc123xyz",
       "def456uvw",
       "ghi789rst"
     ]
   }
   ```

3. **Run the script:**
   ```powershell
   cd ..\backend
   node scripts/fetch-real-decks.js --curated
   ```

The script will:
- Load environment variables from `.env.local`
- Fetch each deck from Moxfield
- Validate it has exactly 100 cards
- Insert into your database
- Skip duplicates

## Troubleshooting

**"Missing Supabase credentials"**: 
- Make sure `.env.local` exists in `frontend/` or project root
- Check that it contains `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

**"No deck IDs found"**: 
- Add deck IDs to `backend/scripts/moxfield-deck-ids.json`
