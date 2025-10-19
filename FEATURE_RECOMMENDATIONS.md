# Feature Recommendations for ManaTap AI

**Document Date**: October 19, 2025  
**Priority Legend**: 🔴 High · 🟡 Medium · 🟢 Low

---

## Executive Summary

This document outlines 35+ prioritized feature recommendations across three strategic categories:
1. **User Engagement** - Features to increase retention, community, and viral growth
2. **Performance & UX** - Technical improvements for speed and usability
3. **Pro Features** - Monetization opportunities and premium value

Each recommendation includes estimated impact, effort, and success metrics.

---

## Category 1: User Engagement Features

### 🔴 High Priority

#### 1. Deck Comments System
**Priority**: 🔴 High  
**Effort**: Medium (2-3 weeks)  
**Expected Impact**: +35% engagement time, +20% return visits

**Description**: Allow users to comment on public decks with threaded conversations.

**Features**:
- Nested comment threads (1-2 levels deep)
- Like/react to comments
- Edit/delete own comments
- Report inappropriate comments (auto-flag for mod review)
- Real-time updates via Server-Sent Events
- Email notifications for deck owners (opt-in)

**Implementation**:
- New tables: `deck_comments`, `comment_reactions`
- API routes: `/api/decks/[id]/comments` (GET, POST, DELETE)
- Component: `DeckComments.tsx` with threading UI
- Moderation queue in admin panel

**Success Metrics**:
- 30%+ of public decks receive at least 1 comment within 7 days
- Average 2.5 comments per engaged deck
- 15%+ of users who comment return within 48 hours

---

#### 2. Deck Templates Library
**Priority**: 🔴 High  
**Effort**: Medium (2 weeks)  
**Expected Impact**: +40% new user activation, -25% initial bounce rate

**Description**: Curated starter decks for beginners by format with guided customization.

**Features**:
- 20+ professionally curated starter decks
- Organized by format (Commander, Standard, Modern) and budget
- "Start from Template" button → creates copy in user's account
- Template tags: #beginner, #budget, #competitive, #theme
- Step-by-step customization guide after copying
- Community can submit templates (Pro users, admin approval)

**Implementation**:
- New table: `deck_templates` with `is_official`, `template_category`, `difficulty_level`
- Page: `/templates` with grid layout
- API: `/api/templates/list`, `/api/templates/copy/[id]`
- Admin panel: template approval queue

**Success Metrics**:
- 50%+ of new users create their first deck from a template
- Template-started decks have 40% higher completion rate
- Average 3 modifications per template before first save

---

#### 3. Card Recommendations Feed
**Priority**: 🔴 High  
**Effort**: High (3-4 weeks)  
**Expected Impact**: +25% card discovery, +15% wishlist additions

**Description**: "You might also like" personalized card recommendations based on collection/decks.

**Features**:
- Daily personalized feed on homepage
- Algorithm considers:
  - Cards in user's decks but not collection
  - Synergies with favorite commanders
  - Cards trending in similar decks
  - Price range matching user's typical purchases
- Filter by: Format, Budget, Color Identity, Card Type
- "Add to Wishlist" and "View Similar" quick actions
- Explanation: "Popular with [Commander Name] builders"

**Implementation**:
- ML/heuristic recommendation engine in `/lib/recommendations.ts`
- API: `/api/recommendations/cards` (personalized)
- Component: `CardRecommendationsFeed.tsx`
- Background job: daily recommendation pre-computation for active users

**Success Metrics**:
- 60%+ of users view recommendations within first week
- 25% conversion rate from recommendation → wishlist/deck
- Average 8 cards added to wishlist per week from recommendations

---

#### 4. Achievement System Expansion
**Priority**: 🔴 High  
**Effort**: Medium (2 weeks)  
**Expected Impact**: +30% gamification engagement, +20% weekly active users

**Description**: 15+ new badges beyond current system.

**New Badges**:
- **Goldfish Master** - Run 100 mulligan simulations
- **Collection Completionist** - Own 1,000+ unique cards
- **Budget Wizard** - Build 5 decks under $50 each
- **Combo Connoisseur** - Include 10 different infinite combos in decks
- **Format Explorer** - Build decks in 5+ different formats
- **Social Butterfly** - Receive 100 likes across all decks
- **Helpful Helper** - Receive 50 "helpful" votes on comments
- **Early Adopter** - Account created in first 6 months (already have)
- **Deck Architect** - Build 25 decks
- **Trendsetter** - Use a card that becomes top 10 trending within 30 days
- **Value Hunter** - Track 50 cards for price drops
- **Perfectionist** - Have 5 decks with 0 banned cards and perfect mana base
- **Lore Master** - Click 100 Scryfall card links
- **Night Owl** - Active on site between 12am-4am local time for 10 sessions
- **Streak Keeper** - Visit site 30 days in a row

**Implementation**:
- Table updates: Add new badge types to `badge_types`
- Background jobs: Nightly badge calculations
- Toast celebrations + social sharing when unlocked
- Profile showcase: Pin favorite badges

**Success Metrics**:
- Average user unlocks 3+ new badges per month
- 40% of users check profile badges weekly
- Badge unlock → 15% boost in next-day return rate

---

#### 5. User Following System
**Priority**: 🔴 High  
**Effort**: High (3 weeks)  
**Expected Impact**: +40% community building, +35% content discovery

**Description**: Follow deck builders and see their public decks in personalized feed.

**Features**:
- "Follow" button on public profiles and deck pages
- Following/Followers count on profiles
- Feed: `/feed` shows recent public decks from followed users
- Notifications when followed users publish new decks
- Suggested follows based on:
  - Users who build similar deck types
  - Users with highly-liked decks
  - Mutual follows
- Privacy: Option to hide followers list

**Implementation**:
- New table: `user_follows` (follower_id, following_id, created_at)
- API: `/api/users/[id]/follow`, `/api/users/[id]/followers`, `/api/users/[id]/following`
- Page: `/feed` with infinite scroll
- Notification system integration

**Success Metrics**:
- 30% of active users follow at least 3 other users
- Feed engagement: 20 minutes average session time
- 50% of followed users publish a new deck within 30 days

---

#### 6. Deck Voting/Rankings
**Priority**: 🔴 High  
**Effort**: Medium (2 weeks)  
**Expected Impact**: +25% deck quality, better content discovery

**Description**: Beyond likes, allow upvote/downvote with sorting and rankings.

**Features**:
- Upvote/downvote system (Reddit-style)
- Net score = upvotes - downvotes
- Sort public decks by: Hot, Top (week/month/all-time), New, Controversial
- "Hot" algorithm considers:
  - Recent activity (views, votes, comments)
  - Velocity (rapid vote growth)
  - Recency (time decay)
- Vote history visible in user profile
- Anti-spam: Rate limit, new users restricted

**Implementation**:
- New table: `deck_votes` (user_id, deck_id, vote: -1/0/1)
- API: `/api/decks/[id]/vote` (POST with vote value)
- Update Browse Decks page with new sort options
- Background job: Hourly "hot score" calculation

**Success Metrics**:
- 40% of engaged users vote on at least 1 deck per week
- Top-voted decks have 3x more views than average
- Controversial sorting reveals underrated gems (20% of views)

---

#### 7. Tournament Brackets
**Priority**: 🔴 High  
**Effort**: High (4 weeks)  
**Expected Impact**: +50% group engagement, new user type (organizers)

**Description**: Create and manage casual tournament brackets with friends.

**Features**:
- Create brackets: Single/double elimination, round-robin
- 4-64 participants
- Deck registration: Link user decks to bracket slots
- Live bracket updates (admin can update match results)
- Match notes: Record winner, game count, key plays
- Share bracket URL (public or private)
- Export bracket to PDF/image for social sharing
- Leaderboards: Track lifetime tournament wins

**Implementation**:
- New tables: `tournaments`, `tournament_participants`, `tournament_matches`
- Page: `/tournaments` (list), `/tournaments/[id]` (bracket view)
- API: CRUD for tournaments and match results
- Bracket visualization: React library like `react-brackets`

**Success Metrics**:
- 10% of active users create at least 1 tournament
- Average 8 participants per tournament
- 60% of tournaments are completed (all matches recorded)

---

#### 8. Playtest Notes
**Priority**: 🔴 High  
**Effort**: Medium (2 weeks)  
**Expected Impact**: +20% deck iteration, better deck quality

**Description**: Attach game notes to deck versions with analysis.

**Features**:
- "Add Playtest Note" button on deck page
- Fields:
  - Opponent deck(s)
  - Win/loss
  - Turns to win/loss
  - MVP cards (performed well)
  - Underperformers (cut candidates)
  - Freeform notes
- Notes attached to specific deck version (snapshot)
- Aggregate stats: Win rate, average turns, top MVPs
- Pro feature: AI analysis of notes → suggested changes

**Implementation**:
- New table: `deck_playtest_notes`
- Component: `PlaytestNotesPanel.tsx` on deck page
- API: `/api/decks/[id]/playtest-notes` (GET, POST, DELETE)
- Analytics dashboard: Win rate trends over time

**Success Metrics**:
- 15% of decks have at least 3 playtest notes
- Decks with notes are iterated 2x more frequently
- 70% of playtest note entries include win/loss data

---

### 🟡 Medium Priority

#### 9. Deck Comparison Tool
**Priority**: 🟡 Medium  
**Effort**: Medium (2-3 weeks)  
**Expected Impact**: +15% deck building confidence

**Description**: Side-by-side comparison of 2-3 decks with visual diffs.

**Features**:
- Select 2-3 decks from "My Decks" or public decks
- Visual columns with card lists
- Highlight differences:
  - Unique to each deck (color-coded)
  - Shared cards across all
  - Quantity differences
- Compare stats: Total cost, mana curve, color distribution
- Export comparison as image or PDF

**Implementation**:
- Page: `/compare?deck1=[id]&deck2=[id]&deck3=[id]`
- Component: `DeckComparisonView.tsx`
- Diff algorithm: Set operations for unique/shared cards

**Success Metrics**:
- 20% of users compare decks at least once
- 40% of comparisons lead to deck edits within 24 hours

---

#### 10. Card Price Alerts
**Priority**: 🟡 Medium  
**Effort**: Medium (2 weeks)  
**Expected Impact**: +30% wishlist engagement

**Description**: Notify when wishlist cards drop below price threshold.

**Features**:
- Set price alert on any wishlist card
- Notification methods: Email, in-app toast, push (PWA)
- Alert triggers:
  - Price drops below $X
  - Price drops by Y%
  - Card reprinted (reprint risk becomes "confirmed")
- Alert history: Track past alerts and actions taken

**Implementation**:
- New table: `price_alerts` (user_id, card_name, threshold, currency)
- Background job: Daily price check + alert dispatch
- Notification system integration
- Settings page: Manage alert preferences

**Success Metrics**:
- 40% of wishlist items have price alerts set
- 60% of triggered alerts result in card purchase/action
- Average price savings: $12 per alert action

---

#### 11. Deck Changelog
**Priority**: 🟡 Medium  
**Effort**: Medium (2 weeks)  
**Expected Impact**: +15% deck versioning usage

**Description**: Auto-track changes between deck saves with visual diffs.

**Features**:
- Automatic changelog entry on each deck save
- Show:
  - Cards added (with quantity)
  - Cards removed (with quantity)
  - Quantity changes
  - Total cost delta
- Timeline view: Visual history of all changes
- Compare any two versions (diff view)
- Rollback to previous version
- Export changelog to text format

**Implementation**:
- Table: `deck_versions` (already exists)
- Enhance with diff computation on save
- Component: `DeckChangelogPanel.tsx`
- Diff algorithm: Compute deltas between versions

**Success Metrics**:
- 50% of decks with 5+ saves have visible changelog
- 15% of users rollback to previous version at least once
- Average 8 changelog entries per deck

---

#### 12. Collaborative Decks
**Priority**: 🟡 Medium  
**Effort**: High (3-4 weeks)  
**Expected Impact**: +25% social engagement

**Description**: Invite others to co-edit a deck.

**Features**:
- "Invite Collaborator" button on deck page
- Invite via username or email
- Permissions:
  - Editor: Full edit access
  - Viewer: Can view but not edit
  - Commenter: Can view and comment only
- Real-time collaboration indicator: "User X is viewing"
- Activity log: Who made what changes
- Notification: When collaborator makes edits

**Implementation**:
- New table: `deck_collaborators` (deck_id, user_id, permission, invited_by)
- API: `/api/decks/[id]/collaborators` (CRUD)
- Real-time: WebSocket or Server-Sent Events for presence
- Conflict resolution: Last-write-wins

**Success Metrics**:
- 10% of decks have at least 1 collaborator
- Collaborative decks are iterated 2.5x more frequently
- Average 2.3 collaborators per collaborative deck

---

#### 13. Deck Tags System
**Priority**: 🟡 Medium  
**Effort**: Low (1 week)  
**Expected Impact**: +20% deck organization

**Description**: User-created tags for personal deck organization.

**Features**:
- Add tags to any deck (max 10 per deck)
- Auto-suggest existing tags as you type
- Popular tags: #cedh, #tribal, #voltron, #combo, #budget, #jank
- Filter "My Decks" by tag
- Tag cloud on profile: Visual representation of deck themes
- Tag-based search in Browse Decks

**Implementation**:
- New table: `deck_tags` (deck_id, tag)
- API: `/api/decks/[id]/tags` (GET, POST, DELETE)
- Component: Tag input with autocomplete
- Browse Decks: Add tag filter

**Success Metrics**:
- 50% of users add tags to at least 3 decks
- Average 4 tags per deck
- 30% of My Decks searches use tag filter

---

## Category 2: Performance & UX Improvements

### 🔴 High Priority

#### 14. Infinite Scroll
**Priority**: 🔴 High  
**Effort**: Low (1 week)  
**Expected Impact**: +40% browse engagement, -50% bounce on pagination

**Description**: Replace pagination on Browse Decks with smooth infinite scroll.

**Features**:
- Load 24 decks initially
- Fetch next 24 when user scrolls to 80% of page
- Loading skeleton at bottom during fetch
- "Back to Top" button appears after 2 screens
- URL updates with scroll position (preserves state on back button)
- Intersection Observer for performance

**Implementation**:
- Update `frontend/app/decks/browse/page.tsx`
- Use Intersection Observer API
- State management: Track page, hasMore
- Update URL with `window.history.pushState`

**Success Metrics**:
- 70% of users scroll past 2 pages
- Average 4.5 pages viewed per session (up from 1.8)
- -60% drop-off on page 2

---

#### 15. Optimistic UI Updates
**Priority**: 🔴 High  
**Effort**: Medium (2 weeks)  
**Expected Impact**: Perceived performance boost, +25% interaction confidence

**Description**: Instant feedback for likes, adds, removes before server confirmation.

**Features**:
- Like button: Instant visual update, revert if server fails
- Card add/remove: Show in list immediately, rollback on error
- Deck save: Show "Saved" toast instantly, queue actual save
- Loading states: Subtle spinner only if server takes >500ms
- Error recovery: Clear undo message if operation fails

**Implementation**:
- Update components: Like buttons, deck editor, collection manager
- Pattern: Update local state → API call → revert on error
- Toast system: Show success instantly, replace with error if needed

**Success Metrics**:
- Perceived performance: 80% of users rate app as "fast"
- -70% user-reported "slow" feedback
- Error rate remains <0.5% (optimistic updates don't hide errors)

---

#### 16. Image Lazy Loading
**Priority**: 🔴 High  
**Effort**: Low (1 week)  
**Expected Impact**: -40% initial page load time, -60% bandwidth for casual users

**Description**: Intersection Observer for card thumbnails.

**Features**:
- Load images only when they enter viewport
- Placeholder: Low-res blur or skeleton
- Fade-in animation on load
- Preload next 10 images before they're visible
- Fallback: Load all images if Intersection Observer unsupported

**Implementation**:
- Create `LazyImage.tsx` component
- Use Intersection Observer with rootMargin
- Replace all card image instances with LazyImage
- Update DeckArtLoader to lazy load

**Success Metrics**:
- Initial page load: -40% time on Browse Decks
- Data usage: -50% for users who don't scroll far
- Lighthouse performance score: +15 points

---

#### 17. Request Deduplication
**Priority**: 🔴 High  
**Effort**: Medium (1-2 weeks)  
**Expected Impact**: -30% API calls, -20% server load

**Description**: Prevent duplicate API calls in rapid succession.

**Features**:
- Deduplicate identical requests within 100ms window
- Cache pending requests: Return same promise for duplicate calls
- Works for: Card search, price lookups, deck fetches
- Client-side implementation (transparent to components)
- Metrics: Track deduplication rate

**Implementation**:
- Create `lib/api/deduplicator.ts`
- Wrap fetch with deduplication layer
- Map of pending requests by URL+params
- Return existing promise if request is in-flight

**Success Metrics**:
- 30% reduction in API calls for high-traffic endpoints
- -20% server compute costs
- No user-facing changes (seamless)

---

#### 18. Skeleton Screens
**Priority**: 🔴 High  
**Effort**: Medium (2 weeks)  
**Expected Impact**: Perceived performance boost, professional polish

**Description**: Better loading states across all pages with content placeholders.

**Features**:
- Skeleton loaders for:
  - Deck lists (grid of shimmer cards)
  - Collection editor (rows with shimmer thumbnails)
  - Chat interface (message bubbles)
  - Profile page (sections with shimmer content)
- Match actual content layout
- Animate: Subtle shimmer effect
- Timing: Show skeleton if load takes >200ms

**Implementation**:
- Create reusable skeleton components:
  - `SkeletonDeckCard.tsx`
  - `SkeletonTable.tsx`
  - `SkeletonProfile.tsx`
- Use in all major pages during initial load
- Tailwind utility classes for shimmer animation

**Success Metrics**:
- User perception: 85% rate loading experience as "smooth"
- -50% reports of "page feels slow"
- Professional appearance: +20% in user trust surveys

---

#### 19. Virtual Scrolling
**Priority**: 🔴 High  
**Effort**: Medium (2 weeks)  
**Expected Impact**: Handle 1000+ card decks smoothly

**Description**: For large decks (100+ cards), render only visible rows.

**Features**:
- Render 50 rows above/below viewport, total ~150 rows
- Smooth scrolling with no jank
- Works for:
  - Deck editor (large decks)
  - Collection manager (1000+ cards)
  - Wishlist (500+ items)
- Search/filter still works across all data

**Implementation**:
- Use library: `react-window` or `react-virtual`
- Update components: CardsPane, collection editor
- Calculate item height dynamically if varied
- Preserve scroll position on filter changes

**Success Metrics**:
- Render 1000-card deck in <100ms (vs current ~2s)
- Smooth 60fps scrolling on large collections
- -90% memory usage for large datasets

---

#### 20. Prefetch Links
**Priority**: 🔴 High  
**Effort**: Low (1 week)  
**Expected Impact**: Perceived instant navigation

**Description**: Hover prefetch for navigation links.

**Features**:
- On link hover, prefetch page data
- Works for: Navigation bar, deck links, user profiles
- Delay: 100ms hover before prefetch starts
- Cache prefetched data for 60 seconds
- Cancel prefetch if hover ends quickly
- Mobile: Prefetch on touchstart

**Implementation**:
- Use Next.js `<Link prefetch>` prop
- Custom hook: `usePrefetch` for manual control
- Update all major navigation links
- Monitor: Track prefetch cache hit rate

**Success Metrics**:
- 70% of navigations feel instant (<100ms)
- Prefetch cache hit rate: 50%
- Data usage: +5% (acceptable trade-off)

---

### 🟡 Medium Priority

#### 21. Search Debouncing
**Priority**: 🟡 Medium  
**Effort**: Low (3 days)  
**Expected Impact**: -70% search API calls

**Description**: 300ms debounce on all search inputs.

**Features**:
- Wait 300ms after last keystroke before search
- Show "Searching..." indicator during debounce
- Cancel previous search if new one starts
- Works for: Card search, deck search, user search

**Implementation**:
- Update all search components
- Use `useDebouncedValue` hook (already exists or create)
- Ensure accessibility: Screen reader announcements

**Success Metrics**:
- -70% card search API calls
- Faster perceived search (no intermediate results)
- Search result quality unchanged

---

#### 22. Bundle Size Optimization
**Priority**: 🟡 Medium  
**Effort**: High (3 weeks)  
**Expected Impact**: -30% initial bundle size, faster first load

**Description**: Code splitting for heavy components.

**Features**:
- Lazy load heavy libraries:
  - Recharts (chart library, ~100KB)
  - Radix UI components (when not immediately visible)
  - PDF export library
- Route-based code splitting (already have via Next.js)
- Component-level splitting for modals, drawers
- Dynamic imports with loading states

**Implementation**:
- Use `next/dynamic` for lazy loading
- Identify heavy components via bundle analyzer
- Split: Price Tracker chart, Collection analytics, Custom Card Creator
- Measure: Lighthouse score improvement

**Success Metrics**:
- Initial bundle: -30% (from ~500KB to ~350KB)
- First Contentful Paint: -400ms
- Lighthouse performance: +10 points

---

#### 23. Accessibility Audit
**Priority**: 🟡 Medium  
**Effort**: High (3-4 weeks)  
**Expected Impact**: WCAG AA compliance, broader user base

**Description**: Comprehensive WCAG AA compliance pass.

**Features**:
- Keyboard navigation: All interactive elements accessible
- Screen reader: ARIA labels on all components
- Color contrast: Minimum 4.5:1 for text
- Focus indicators: Visible focus on all focusable elements
- Alt text: All images have descriptive alt text
- Form labels: All inputs have associated labels
- Error messages: Clear, descriptive, associated with inputs

**Implementation**:
- Audit tool: axe DevTools, Lighthouse
- Fix issues page-by-page (prioritize high-traffic pages)
- Test with screen readers: NVDA, JAWS, VoiceOver
- Document: Accessibility statement page

**Success Metrics**:
- WCAG AA compliance: 100% (0 violations)
- Lighthouse accessibility: 100/100
- Screen reader users: +10% usability rating

---

#### 24. Mobile Gestures
**Priority**: 🟡 Medium  
**Effort**: Medium (2 weeks)  
**Expected Impact**: +20% mobile user satisfaction

**Description**: Swipe actions for deck/collection management.

**Features**:
- Swipe left on deck tile → Reveal quick actions (Edit, Delete, Share)
- Swipe right on collection card → Add to wishlist
- Pinch to zoom on card images (hover preview)
- Pull to refresh on Browse Decks page
- Long press on deck → Multi-select mode

**Implementation**:
- Use touch event listeners or library like `react-swipeable`
- Components: MyDecksList, Collections
- Animations: Smooth reveal/hide of action buttons
- Disable during scroll to prevent conflicts

**Success Metrics**:
- 40% of mobile users use swipe actions
- Mobile usability: +25% satisfaction rating
- Accidental triggers: <5%

---

#### 25. Offline Mode V2
**Priority**: 🟡 Medium  
**Effort**: High (4 weeks)  
**Expected Impact**: +15% mobile engagement, PWA USP

**Description**: Editable deck drafts that sync when online.

**Features**:
- Offline deck editing (stored in IndexedDB)
- Queue edits: Sync when connection restored
- Visual indicator: "Offline mode" banner
- Conflict resolution: Last-write-wins, with manual merge option
- Offline-first: Save locally immediately, sync in background

**Implementation**:
- Use IndexedDB for local storage
- Service Worker: Handle offline requests
- Sync API: Background sync when online
- Conflict detection: Compare timestamps on sync

**Success Metrics**:
- 20% of mobile users edit decks offline
- Sync success rate: >95%
- No data loss incidents

---

#### 26. Web Vitals Dashboard
**Priority**: 🟡 Medium  
**Effort**: Medium (2 weeks)  
**Expected Impact**: Proactive performance monitoring

**Description**: Real-time performance monitoring for admins.

**Features**:
- Dashboard: `/admin/vitals`
- Metrics tracked:
  - Largest Contentful Paint (LCP)
  - First Input Delay (FID)
  - Cumulative Layout Shift (CLS)
  - Time to First Byte (TTFB)
- Aggregated by page, device type, geography
- Alerts: Email if metrics degrade >20%
- Historical trends: 7-day, 30-day charts

**Implementation**:
- Collect metrics: `web-vitals` library
- Send to backend: `/api/analytics/web-vitals` (POST)
- Store in database: `web_vitals` table
- Admin dashboard: Fetch and visualize

**Success Metrics**:
- All pages meet Core Web Vitals "Good" thresholds
- Proactive fixes before users complain
- -50% performance-related support tickets

---

## Category 3: Pro Feature Enhancements

### 🔴 High Priority

#### 27. Advanced Deck Analytics
**Priority**: 🔴 High  
**Effort**: High (4 weeks)  
**Expected Impact**: +30% Pro conversion, key differentiator

**Description**: Win rate tracking, matchup analysis, meta positioning.

**Features**:
- Win/loss tracking per deck
- Matchup matrix: Win rate vs. specific opponent decks/archetypes
- Meta positioning: How your deck compares to popular meta decks
- Trend analysis: Win rate over time with deck iterations
- Key performance metrics:
  - Average turns to win/loss
  - Most impactful cards (correlated with wins)
  - Underperforming cards (present in losses)
- Export analytics to PDF/CSV

**Implementation**:
- Table: `deck_matches` (deck_id, opponent_deck, result, turns, notes)
- Complex analytics: SQL queries with JOINs
- Visualizations: Win rate charts, matchup heatmap
- Pro-gated page: `/decks/[id]/analytics`

**Success Metrics**:
- 60% of Pro users track at least 5 matches
- Average 20 matches tracked per deck
- Pro conversion: 25% of users upgrade after seeing this feature

---

#### 28. Deck Version History
**Priority**: 🔴 High  
**Effort**: Medium (2 weeks)  
**Expected Impact**: +20% Pro retention, professional tool perception

**Description**: Full git-like version control with rollback.

**Features**:
- Every deck save creates a version
- Version list: Chronological with timestamps and change summaries
- Compare versions: Side-by-side diff
- Rollback: Restore any previous version
- Branch versions: Create alternate version from any point (Pro only)
- Version tags: Mark important versions (e.g., "Tournament Ready")
- Export version history to JSON

**Implementation**:
- Table: `deck_versions` (already exists, enhance)
- Store full deck_text snapshot per version
- Component: `VersionHistoryPanel.tsx`
- Diff algorithm: Efficient delta computation

**Success Metrics**:
- 80% of Pro users have decks with 5+ versions
- 30% rollback to previous version at least once
- Version history viewed 3x per month per Pro user

---

#### 29. Bulk Operations
**Priority**: 🔴 High  
**Effort**: Medium (2-3 weeks)  
**Expected Impact**: +15% Pro user productivity

**Description**: Import/export/modify multiple decks at once.

**Features**:
- Bulk import: Upload ZIP of deck files (Arena/MTGO format)
- Bulk export: Download all decks as ZIP
- Bulk tagging: Add/remove tags across multiple decks
- Bulk publish/unpublish
- Bulk delete with confirmation
- Bulk price update: Refresh prices for all decks
- Progress indicator for long operations

**Implementation**:
- Page: `/my-decks?mode=bulk`
- API: `/api/decks/bulk` (accepts array of operations)
- Job queue: Process operations asynchronously
- Notification: Completion email for long jobs

**Success Metrics**:
- 30% of Pro users use bulk operations
- Average 8 decks operated on per bulk action
- Time saved: -70% for multi-deck operations

---

#### 30. Custom Price Sources
**Priority**: 🔴 High  
**Effort**: High (3 weeks)  
**Expected Impact**: +10% Pro conversion, power user feature

**Description**: Choose TCGPlayer, CardMarket, or average across sources.

**Features**:
- Price source selector on all price displays
- Options:
  - Scryfall (default)
  - TCGPlayer Market
  - CardMarket
  - Average of all sources
- Remember preference per user
- Historical price charts per source
- Export prices with source attribution

**Implementation**:
- Integrate TCGPlayer and CardMarket APIs
- Update price cache to store multi-source prices
- UI: Dropdown selector on Cost-to-Finish, Wishlist
- Background job: Daily fetch from all sources

**Success Metrics**:
- 50% of Pro users change default price source
- Price accuracy: ±5% of actual purchase price
- Feature awareness: 70% of Pro users know about this

---

#### 31. AI Deck Coach
**Priority**: 🔴 High  
**Effort**: High (4-5 weeks)  
**Expected Impact**: +40% Pro value perception

**Description**: Weekly AI deck review with improvement suggestions.

**Features**:
- Weekly email: "Your Deck Report for [Deck Name]"
- Analysis includes:
  - Mana curve optimization suggestions
  - Land count recommendation
  - Card synergy opportunities
  - Budget upgrade options
  - Meta-relevant additions
- Tone: Friendly, constructive, educational
- Interactive: Click suggestion to add to deck
- Deck health score: 0-100 based on multiple factors

**Implementation**:
- Background job: Weekly deck analysis for active Pro users
- LLM integration: GPT-4 or Claude for analysis
- Template system: Structured prompts for consistent output
- Email service: SendGrid or similar

**Success Metrics**:
- 80% email open rate
- 40% click-through rate on suggestions
- 25% of suggestions are applied to decks
- Pro retention: +30% (users value ongoing advice)

---

#### 32. Priority Support Channel
**Priority**: 🔴 High  
**Effort**: Low (1 week)  
**Expected Impact**: +20% Pro satisfaction

**Description**: Discord/email fast-track for Pro users.

**Features**:
- Private Discord channel: #pro-support
- Email: Support response within 4 hours (vs 24h for free)
- Direct line to development team for feature requests
- Pro-only Q&A sessions (monthly live stream)
- Pro badge in Discord for community recognition

**Implementation**:
- Set up Discord server with role-based channels
- Email routing: Pro user emails tagged priority
- Integrate with support ticket system
- Schedule monthly Q&A on calendar

**Success Metrics**:
- Pro support satisfaction: 95%+
- Average response time: 2 hours
- 50% of Pro users join Discord channel

---

#### 33. Early Access Features
**Priority**: 🔴 High  
**Effort**: Ongoing (process, not feature)  
**Expected Impact**: +35% Pro excitement, beta testing pool

**Description**: Pro users test new features 2-4 weeks before public release.

**Features**:
- Feature flag system: Enable beta features for Pro users
- "Beta" badge on new features
- Feedback form: Direct input to dev team
- Priority for bug reports on beta features
- Exclusive announcements: Email newsletter for Pro users

**Implementation**:
- Feature flags in database: `app_config.beta_features`
- Middleware: Check user Pro status and feature flags
- UI: Beta badge component
- Feedback system: In-app modal or survey link

**Success Metrics**:
- 60% of Pro users enable at least 1 beta feature
- Beta feedback quality: 80% useful/actionable
- Pro users feel valued: +40% satisfaction

---

### 🟡 Medium Priority

#### 34. Export to All Formats
**Priority**: 🟡 Medium  
**Effort**: Medium (2 weeks)  
**Expected Impact**: +10% Pro conversion (convenience feature)

**Description**: TappedOut, Archidekt, Deckbox, EDHRec export.

**Features**:
- Export modal: Choose destination format
- Formats supported:
  - TappedOut (text format)
  - Archidekt (JSON)
  - Deckbox (CSV)
  - EDHRec (text with commander header)
  - MTGO (txt)
  - MTG Arena (copy-paste format)
- Copy to clipboard or download file
- Preserve categories (commander, lands, creatures, etc.)

**Implementation**:
- Formatters: Create export functions per format
- Component: `ExportModal.tsx` with format selection
- API: `/api/decks/[id]/export?format=tappedout`

**Success Metrics**:
- 30% of Pro users export to external tool
- Most popular: Archidekt (40%), TappedOut (30%), MTGO (20%)

---

#### 35. Advanced Filters
**Priority**: 🟡 Medium  
**Effort**: Medium (2 weeks)  
**Expected Impact**: +15% deck discovery efficiency

**Description**: Mana value, card types, synergy scores in Browse Decks.

**Features**:
- Filter decks by:
  - Average mana value (1-7+)
  - Creature %: 0-20, 20-40, 40-60, 60%+
  - Card types: Has instants, Has artifacts, etc.
  - Synergy score: Combo potential rating
  - Deck age: Last updated within X days
  - Popularity: Views, likes threshold
- Save filter presets (Pro only)
- Share filter URL with others

**Implementation**:
- Update Browse Decks API with query parameters
- Complex filtering: Pre-computed deck stats
- UI: Expandable filter panel
- URL state: Encode filters in query params

**Success Metrics**:
- 40% of users apply at least 1 advanced filter
- Filter usage increases deck discovery by 30%
- Saved presets: Average 2 per Pro user

---

#### 36. Deck Testing Suite
**Priority**: 🟡 Medium  
**Effort**: High (5-6 weeks)  
**Expected Impact**: +25% Pro excitement, unique feature

**Description**: Goldfish simulator with mulligan AI.

**Features**:
- Simulate opening hands (7 cards)
- Draw through deck turn by turn
- AI mulligan advisor: "Keep" or "Mulligan" with reasoning
- Track goldfish statistics:
  - Average turn to cast commander
  - Turn 1-5 consistency (lands, ramp)
  - Combo turn (if applicable)
- Run 100 simulations → aggregate stats
- Compare deck variants to optimize

**Implementation**:
- Simulation engine: Pure JS, no backend
- Mulligan AI: Rule-based heuristics (Pro: LLM-based)
- Component: `DeckTesterPanel.tsx`
- Worker thread: Don't block UI during simulation

**Success Metrics**:
- 30% of Pro users run at least 10 simulations
- Goldfish data correlates with real playtest data
- Feature differentiation: Unique to ManaTap AI

---

#### 37. Collection Import
**Priority**: 🟡 Medium  
**Effort**: High (3 weeks)  
**Expected Impact**: +20% new user activation (ease of onboarding)

**Description**: Auto-import collections from TCGPlayer, Deckbox, Dragon Shield.

**Features**:
- Import sources:
  - TCGPlayer: CSV export from collection
  - Deckbox: Export inventory
  - Dragon Shield: Card Manager export
  - Delver Lens: Photo-based import
  - Manual CSV: Custom format
- Intelligent parsing: Handle variations in card names
- Duplicate detection: Ask before overwriting
- Preview before import: Show cards to be added

**Implementation**:
- Parser functions for each format
- API: `/api/collections/import` (accepts file upload)
- Fuzzy matching for card names (already have)
- UI: Import wizard with step-by-step guidance

**Success Metrics**:
- 40% of new users import existing collection
- Average 250 cards imported per user
- Import success rate: 95% (cards matched correctly)

---

#### 38. Proxy Generator
**Priority**: 🟡 Medium  
**Effort**: Medium (2-3 weeks)  
**Expected Impact**: +10% Pro interest (casual play niche)

**Description**: High-quality printable proxies.

**Features**:
- Select cards from deck to proxy
- Print layout: 3x3 cards per A4/Letter page
- Customization:
  - Add "PROXY" watermark (optional)
  - Black/white or color
  - Resolution: 300 DPI
- Export as PDF or high-res PNG
- Disclaimer: For casual play only, not for sanctioned events

**Implementation**:
- Canvas API: Render card images to PDF
- Use Scryfall high-res images
- Layout: 63mm x 88mm per card (standard MTG size)
- Library: jsPDF or similar

**Success Metrics**:
- 15% of Pro users generate proxies
- Average 12 cards proxied per session
- Legal disclaimer acknowledged: 100%

---

#### 39. Team/Family Plans
**Priority**: 🟡 Medium  
**Effort**: Medium (2 weeks)  
**Expected Impact**: +20% Pro revenue, new customer segment

**Description**: Share Pro benefits with 2-5 users.

**Features**:
- Plans: Family (3 users), Team (5 users), Group (10 users)
- Pricing: $14.99/mo (Family), $24.99/mo (Team), $44.99/mo (Group)
- Admin: Invite/remove members
- Shared benefits: All Pro features for all members
- Privacy: Decks remain private unless shared
- Usage tracking: Admin sees aggregate usage

**Implementation**:
- Table: `pro_teams` (team_id, admin_user_id, plan_type)
- Table: `team_members` (team_id, user_id)
- Stripe: Multi-seat subscription management
- Admin panel: Team management UI

**Success Metrics**:
- 10% of Pro users upgrade to Family/Team plan
- Average 3.5 active members per team
- Team retention: 85% (vs 75% for individual Pro)

---

## Implementation Roadmap

### Phase 1 (Months 1-2): User Engagement Foundation
- Deck Comments System
- Deck Templates Library
- Achievement System Expansion

**Why**: Build community and reduce churn with social features.

### Phase 2 (Months 2-3): Performance Wins
- Infinite Scroll
- Optimistic UI Updates
- Image Lazy Loading
- Request Deduplication

**Why**: Quick wins, significant perceived performance improvement.

### Phase 3 (Months 3-4): Pro Value Add
- Advanced Deck Analytics
- AI Deck Coach
- Deck Version History

**Why**: Justify Pro subscription with advanced tools.

### Phase 4 (Months 4-5): Discovery & Growth
- Card Recommendations Feed
- User Following System
- Deck Voting/Rankings

**Why**: Viral growth features, user-generated content loop.

### Phase 5 (Months 5-6): Community Building
- Tournament Brackets
- Collaborative Decks
- Playtest Notes

**Why**: Deepen engagement, create reasons to return daily.

### Phase 6 (Months 6+): Polish & Advanced Features
- Remaining medium-priority features
- Continuous optimization
- User-requested additions

---

## Success Metrics Summary

### User Engagement
- **Primary**: Daily Active Users +50%
- **Secondary**: Average session time +40 minutes
- **Retention**: 7-day retention +35%

### Performance
- **Lighthouse Score**: 95+ (currently ~80)
- **API Response Time**: P95 < 300ms
- **Cache Hit Rate**: 80%+

### Monetization
- **Pro Conversion**: 12% (from 8%)
- **Pro Retention**: 85% at 6 months
- **Revenue per User**: +60%

### Community
- **Public Decks**: 3x growth
- **Comments per Deck**: 2.5 average
- **Monthly Tournaments**: 500+

---

## Priority Matrix

```
High Impact, Low Effort (DO FIRST):
- Infinite Scroll
- Image Lazy Loading
- Optimistic UI Updates
- Skeleton Screens
- Search Debouncing

High Impact, High Effort (STRATEGIC):
- Deck Comments System
- Card Recommendations Feed
- Advanced Deck Analytics
- AI Deck Coach
- Tournament Brackets

Low Impact, Low Effort (QUICK WINS):
- Deck Tags System
- Prefetch Links
- Request Deduplication

Low Impact, High Effort (AVOID FOR NOW):
- Team/Family Plans (until more Pro users)
- Deck Testing Suite (niche feature)
```

---

**Document End**  
For questions or prioritization changes, contact the development team.


