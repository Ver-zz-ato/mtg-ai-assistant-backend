# Adding Public Commander Decks - Multiple Approaches

Since Moxfield API/scraping can be unreliable, here are several approaches:

## Quick Test: Verify a Deck ID Works

Before adding deck IDs, test if they're accessible:

```powershell
cd backend
node scripts/test-moxfield-deck.js <deck-id>
```

This will tell you if:
- The API endpoint works
- The deck is public
- The deck has exactly 100 cards
- The web page is scrapeable

## Option 1: Use curated-decklists.json (Most Reliable)

## Option 1: Use curated-decklists.json (Recommended)

1. **Edit `backend/scripts/curated-decklists.json`**
   - Add decklists in the format shown
   - Each deck must have exactly 100 cards (99 + 1 commander)
   - Deck text format: Commander on first line, then cards as "1 Card Name" or "Card Name"

2. **Run the script:**
   ```powershell
   cd backend
   node scripts/add-curated-decklists.js
   ```

## Option 2: Find working Moxfield deck IDs manually

1. Go to https://www.moxfield.com/decks?format=commander&sort=popular
2. Click on a deck
3. Test the deck ID by visiting: `https://api.moxfield.com/v2/decks/all/{deckId}`
4. If it returns JSON data, add the ID to `moxfield-deck-ids.json`
5. Run: `node scripts/fetch-real-decks.js --curated`

## Option 3: Use EDHREC average decks

EDHREC provides average decklists for popular commanders. You could:
- Visit https://edhrec.com/commanders/{commander-name}
- Copy the average decklist
- Format it and add to `curated-decklists.json`

## Why this approach?

- Moxfield API may require authentication or have rate limits
- Web scraping is fragile and breaks when page structure changes
- Manually curated lists ensure quality and 100-card validation
- You control exactly which decks are added
