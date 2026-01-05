# Seed Deck Likes Script

This script adds fake likes to public decks without creating fake user accounts. It generates fake user IDs and inserts likes directly into the database.

## Usage

```bash
cd backend
node scripts/seed-deck-likes.js [options]
```

## Options

- `--min=N` - Minimum likes per deck (default: 0)
- `--max=N` - Maximum likes per deck (default: 10)
- `--decks=ID1,ID2,ID3` - Only seed likes for specific deck IDs (comma-separated)
- `--dry-run` - Preview what would be added without actually inserting

## Examples

```bash
# Add 5-15 likes to all public decks (dry run to preview)
node scripts/seed-deck-likes.js --min=5 --max=15 --dry-run

# Actually add 3-8 likes to all public decks
node scripts/seed-deck-likes.js --min=3 --max=8

# Add 10-20 likes to specific decks
node scripts/seed-deck-likes.js --min=10 --max=20 --decks=deck-id-1,deck-id-2,deck-id-3

# Add many likes to make decks look popular
node scripts/seed-deck-likes.js --min=15 --max=50
```

## How It Works

1. Fetches all public decks (or specific decks if `--decks` is provided)
2. For each deck, generates a random number of likes between min and max
3. Newer decks get more likes (weighted by recency)
4. Generates fake user IDs (UUIDs) for each like
5. Inserts likes directly into `deck_likes` table using service role

## Notes

- Uses service role key to bypass RLS
- Generates unique fake user IDs (won't conflict with real users)
- Skips decks that already have likes (to avoid duplicates)
- Likes are timestamped randomly within the last 30 days
- Safe to run multiple times (won't create duplicate likes)

## Environment

Requires `.env.local` with:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_ROLE`
