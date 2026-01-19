# Build Assistant - Function Documentation

## Overview
The Build Assistant provides four main functions to help you analyze and improve your Magic: The Gathering deck. This document explains what each function does and how it works.

---

## 1. ✓ Check Legality

**What it does:**
- Verifies your deck is legal for the selected format (Commander, Modern, Pioneer)
- Checks for banned cards in that format
- Validates color identity conflicts (for Commander format)
- Updates price snapshots for all cards in your deck

**How it works:**
1. Sends your decklist to `/api/deck/analyze` endpoint
2. The API checks each card against:
   - Format-specific banned lists
   - Commander color identity rules (if applicable)
   - Scryfall database for card legality
3. Displays results in a panel showing:
   - Number of banned cards (if any)
   - Number of color identity conflicts (if any)
   - How many card prices were updated

**When to use:**
- Before a tournament or event
- After importing a decklist
- When switching formats
- To ensure your deck meets format requirements

**Timeout:** 2 minutes (120 seconds)

---

## 2. 💰 Budget Swaps (PRO)

**What it does:**
- Finds cheaper alternatives for expensive cards in your deck
- Suggests cards that fill the same role but cost less
- Preserves deck function while reducing total cost

**How it works:**
1. You set a budget threshold (e.g., "$5 per card")
2. The function analyzes each card in your deck using AI
3. For expensive cards, it finds alternatives that:
   - Cost less than the threshold
   - Fill the same role (ramp, removal, draw, etc.)
   - Match your deck's color identity
   - Are legal in your format
   - Preserve synergies when possible
4. Shows suggestions with:
   - Original card and price
   - Suggested replacement and price
   - Estimated savings
   - Reason why the swap works

**When to use:**
- Building on a budget
- Reducing deck cost without losing power
- Finding recent reprints (often cheaper)

**Requirements:** Pro subscription

**Timeout:** Varies (uses AI, can take 30-60 seconds)

---

## 3. 📊 Balance Curve (PRO)

**What it does:**
- Analyzes your deck's mana curve distribution
- Suggests cards to fill gaps in your curve
- Helps ensure smooth gameplay from turn 1 to late game

**How it works:**
1. Analyzes your deck to calculate mana curve buckets (1-drops, 2-drops, 3-drops, etc.)
2. Compares against format-specific baselines:
   - **Commander**: Follows the "2-3-4 rule"
     - 2 mana: 8-12 ramp pieces
     - 3 mana: 12-15 value engines
     - 4 mana: 10-14 threats
3. Identifies gaps (e.g., too few 2-drops)
4. Suggests specific cards to add:
   - **2-drop ramp**: Arcane Signet, Talismans, Mind Stone
   - **1-drop ramp**: Sol Ring, Llanowar Elves (if green)
5. Respects your "On-color adds" setting (if enabled, only suggests cards within your color identity)

**When to use:**
- Deck feels clunky or has awkward draws
- Too many expensive cards (top-heavy)
- Not enough early plays
- Want smoother gameplay

**Requirements:** Pro subscription

**Timeout:** ~10-20 seconds

---

## 4. 🔄 Re-analyze (PRO)

**What it does:**
- Triggers a fresh analysis of your deck
- Updates all deck statistics and metrics
- Refreshes health indicators, mana curve, and role distribution

**How it works:**
1. Dispatches an event that triggers the Deck Analyzer to run
2. The analyzer recalculates:
   - Mana curve distribution
   - Role distribution (ramp, removal, draw, etc.)
   - Health metrics (mana base, interaction, card draw)
   - Format legality
   - Power level indicators
3. Updates all displayed statistics on the page

**When to use:**
- After making multiple card changes
- When deck statistics seem out of date
- After importing a decklist

**Requirements:** Pro subscription

**Timeout:** Instant (just triggers the analyzer)

---

## Common Issues

### Timeout Errors

**Problem:** Functions show "Analysis timed out" after 2 minutes.

**Solutions:**
- **Large decks**: Analysis takes longer for 100-card Commander decks. Consider analyzing in sections.
- **Network issues**: Check your internet connection. Scryfall API calls can be slow.
- **Server load**: Try again in a few moments if the server is busy.

**Workaround:** Use the individual Deck Analyzer panel which has progress indicators.

### "Computing..." Forever

**Problem:** Function shows "Computing..." but never completes.

**Likely causes:**
- Network timeout (connection dropped)
- Server-side timeout (API took too long)
- Very large deck (100+ cards with many complex cards)

**Solutions:**
1. Refresh the page and try again
2. Try with a smaller deck subset
3. Check browser console for errors (F12 → Console)
4. Contact support if it persists

---

## Technical Details

- **All functions use**: `/api/deck/analyze` or `/api/deck/swap-suggestions` endpoints
- **Timeout settings**: 120 seconds (2 minutes) for analysis functions
- **Error handling**: Functions show user-friendly error messages
- **Progress indicators**: "Computing..." status shown during execution

---

## Tips for Best Results

1. **For Check Legality**: Set your format and colors correctly in Constraints before running
2. **For Budget Swaps**: Start with a reasonable threshold ($5-10 per card for Commander)
3. **For Balance Curve**: Review your current curve first in the "Mana Curve" panel
4. **For Re-analyze**: Use after major changes (10+ cards added/removed)

---

*Last updated: 2025-01-26*
