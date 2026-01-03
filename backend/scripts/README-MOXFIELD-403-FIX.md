# Fixing Moxfield 403 Forbidden Errors

If you're getting 403 Forbidden errors when fetching decks, Moxfield is blocking automated requests.

## Solutions:

### Option 1: Use Puppeteer (Recommended for Production)

Install Puppeteer to render pages like a real browser:

```powershell
cd backend
npm install puppeteer
```

Then modify `fetch-real-decks.js` to use Puppeteer instead of fetch. This will make requests look like a real browser.

### Option 2: Use Curated Decklists (Most Reliable)

Skip Moxfield entirely and use manually curated decklists:

1. Get decklists from EDHREC or other sources
2. Add to `curated-decklists.json`
3. Run: `node scripts/add-curated-decklists.js`

### Option 3: Manual Export from Moxfield

1. Visit each deck in a browser
2. Use Moxfield's export feature
3. Copy the decklist text
4. Add to `curated-decklists.json`

### Option 4: Use Moxfield Export API

Some decks have export endpoints. Try:
- `https://www.moxfield.com/decks/{deckId}/export?format=txt`

### Current Status

The script now:
- Uses better browser-like headers
- Tries web scraping first (more reliable than API)
- Has improved parsing patterns
- Adds delays to avoid rate limiting

If you still get 403 errors, Moxfield has likely implemented stronger bot protection and you'll need Puppeteer or the curated decklists approach.
