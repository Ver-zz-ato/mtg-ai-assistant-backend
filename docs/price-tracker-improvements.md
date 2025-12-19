# Price Tracker Page - Improvements & Suggestions

## ✅ Completed

1. **Collapsible Top Movers List** - Added expand/collapse button
2. **Scrollable Table** - Max height of 400px with custom scrollbar
3. **Better Filtering** - Shows count of filtered vs total results
4. **Enhanced Table Styling** - Sticky header, hover effects, better spacing

## 💡 Additional Suggestions

### Priority 1: High Impact, Low Effort

1. **Card Image Previews**
   - Add small thumbnails next to card names in Top Movers table
   - Hover to show full-size card image
   - Improves visual recognition of cards

2. **Click to Add to Chart**
   - Make card names clickable in Top Movers
   - Clicking adds the card to the main price chart
   - Quick way to compare multiple movers

3. **Export Top Movers**
   - Add "Export CSV" button for Top Movers table
   - Export filtered results with all columns
   - Useful for analysis outside the app

4. **Sortable Columns**
   - Make table columns sortable (click header to sort)
   - Sort by: Card name, Prior, Latest, Δ, Δ%
   - Visual indicators for sort direction

### Priority 2: Medium Impact, Medium Effort

5. **Price Trend Sparklines**
   - Add mini sparkline charts in Top Movers table
   - Show 7-day price trend for each card
   - Quick visual indicator of price movement pattern

6. **Watchlist Quick Actions**
   - Add "Add to Watchlist" button for each row
   - Bulk select multiple cards to add at once
   - Visual indicator for cards already in watchlist

7. **AI-Powered Insights**
   - Add "Why is this moving?" button for each card
   - AI analyzes recent events (tournaments, reprints, bans)
   - Provides context for price movements

8. **Price Alerts**
   - Set price alerts for cards in Top Movers
   - Notify when cards hit certain thresholds
   - Email/push notifications for significant moves

### Priority 3: Nice to Have

9. **Historical Comparison**
   - Compare current movers to previous periods
   - "Compare to last month" toggle
   - Shows which cards are consistently volatile

10. **Format Filtering**
    - Filter Top Movers by format (Commander, Modern, etc.)
    - Shows format-specific price movements
    - More relevant for format-specific players

11. **Card Details Modal**
    - Click card name to open detailed modal
    - Shows full price history, reprint info, set info
    - Links to Scryfall, TCGPlayer, etc.

12. **Mobile Optimization**
    - Better responsive design for Top Movers table
    - Card view on mobile instead of table
    - Swipeable cards with key metrics

### Technical Improvements

13. **Virtual Scrolling**
    - For large lists (100+ cards), use virtual scrolling
    - Improves performance with many results
    - Smoother scrolling experience

14. **Caching & Performance**
    - Cache Top Movers results for 5 minutes
    - Reduce API calls when filters don't change
    - Background refresh while showing cached data

15. **Real-time Updates**
    - WebSocket connection for live price updates
    - Highlight cards that moved since page load
    - "Live" indicator for real-time data

## Current State Analysis

### ✅ What's Working Well
- Clean, organized layout
- Good filter options (window, min price, watchlist)
- Clear visual indicators (green/red for gains/losses)
- Responsive design

### ⚠️ Areas for Improvement
- No visual card previews (harder to recognize cards)
- Can't quickly add movers to chart
- No export functionality
- Limited interactivity (can't sort, click, etc.)
- No context for why prices are moving

## Implementation Notes

- Top Movers component is well-structured and easy to extend
- Filtering logic is clean and efficient
- Table rendering is performant
- Easy to add new features incrementally







