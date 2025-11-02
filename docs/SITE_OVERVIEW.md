# ManaTap AI - Comprehensive Website Overview

**Platform**: Magic: The Gathering AI-Powered Deck Building Assistant  
**URL**: https://manatap.ai  
**Tech Stack**: Next.js 15, React 19, TypeScript, Supabase (PostgreSQL), OpenAI GPT-5, Stripe, PostHog

---

## 🎯 Core Value Proposition

ManaTap AI is an intelligent Magic: The Gathering deck building platform that combines AI-powered analysis, real-time pricing data, and comprehensive deck management tools. It helps players build, optimize, and budget their decks with advanced AI assistance, probability calculations, and cost optimization features.

---

## 🏗️ Architecture & Technology

### Frontend
- **Framework**: Next.js 15 (App Router) with React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS with dark mode support
- **State Management**: React Context (ProContext, ChatContext)
- **Deployment**: Vercel (production frontend)

### Backend
- **Database**: Supabase (PostgreSQL) with Row Level Security (RLS)
- **Authentication**: Supabase Auth (email/password, with verification)
- **Payment Processing**: Stripe (subscriptions + one-time payments)
- **Analytics**: PostHog (dual-tracking: client-side + server-side)
- **AI**: OpenAI GPT-5 (chat completions API)
- **Data Sources**: Scryfall API (110k+ MTG cards, pricing, images)

### Data Infrastructure
- **Scryfall Cache**: Local database cache of all MTG card data (110k+ cards)
- **Price Cache**: Real-time USD/EUR pricing for cards
- **Price Snapshots**: Historical price tracking for trend analysis
- **Automated Jobs**: GitHub Actions (nightly bulk imports, price updates)

---

## 🎮 Main Features & Pages

### 1. **Homepage** (`/`)
- **AI Chat Interface**: Main deck-building assistant with voice input
- **Mode Options**: Brewer, Judge, Tutor, Coach personas
- **Top Tools Strip**: Quick access to 5 main features (Probability, Mulligan, Cost-to-Finish, Budget Swaps, Price Tracker)
- **Meta Deck Panel**: Trending commanders and format statistics
- **Public Decks Feed**: Most liked decks, recent public decks
- **Shoutbox**: Live activity feed from other users

### 2. **My Decks** (`/my-decks`)
- **Deck Grid**: Visual cards with banner art, like counts, pinning (up to 3)
- **Deck Management**: Create, edit, delete, duplicate, make public/private
- **Build Assistant**: Sticky panel with constraints, next actions, undo/redo
- **Deck Analytics**: Mana curve, color pie, archetype detection, trends radar
- **Export Options**: CSV, Moxfield, MTGO, Arena formats (Pro-gated)
- **Deck Versions**: Version history tracking (Pro feature)

### 3. **Deck Editor** (`/my-decks/[id]` or `/deck/[id]`)
- **Card Management**: Add/remove cards, quantity controls, card search
- **Card Previews**: Hover previews with Scryfall images and metadata
- **Functions Panel**: 
  - Cost to Finish (shopping list with prices)
  - Budget Swaps (AI-powered cheaper alternatives, Pro-gated)
  - Legality & Tokens (banned cards, color identity conflicts, token checklist)
  - Probability Helpers (combo odds, draw probability, Pro-gated)
  - Hand Testing Widget (London mulligan simulator with real card art, Pro-gated)
- **AI Mini-Chat**: Deck-specific AI assistant
- **Shopping List Generator**: Export formatted lists for purchases
- **Deck Comments**: Free social feature for deck discussions

### 4. **Collections** (`/collections`)
- **Collection Manager**: Create, edit, organize collections by set/theme
- **CSV Import**: Bulk import cards from Arena/other formats
- **Virtual Scrolling**: Efficient rendering for 1000+ card collections
- **Advanced Filters**: Color, type, price ranges, rarity, sets
- **Analytics Panel**: Color pie, type histogram, price distribution, set breakdown
- **Bulk Operations**: Set to playset, fix names, price snapshot refresh (Pro-gated)
- **Wishlist Compare**: See which collection cards are on wishlist
- **Export Options**: CSV, MTGA, MTGO, Moxfield formats (Pro-gated)

### 5. **Wishlists** (`/wishlist`)
- **Multiple Wishlists**: Create, rename, delete named wishlists
- **Quick Add**: Typeahead search for adding cards
- **CSV Import/Export**: Bulk operations for wishlist management
- **Fix Names**: Batch normalization of card names (Pro-gated)
- **Wishlist Items**: Full card details with prices and hover previews
- **Compare with Collections**: See what you need vs. what you own

### 6. **Price Tracker** (`/price-tracker`)
- **Card Search**: Search any MTG card by name
- **Price History**: Historical price charts (last 90 days, Pro-gated)
- **Price Movers**: Biggest gains/losses over time periods
- **Watchlist**: Track specific cards for price alerts (Pro-gated)
- **Deck Value Tracking**: Monitor total deck value over time (Pro-gated)
- **Multiple Currencies**: USD, EUR, GBP support

### 7. **Cost to Finish** (`/budget-swaps?deckId=...`)
- **Shopping List**: Shows cards needed for deck completion
- **Price Comparison**: Current vs. snapshot prices, delta calculations
- **Budget Swaps**: AI-powered cheaper alternatives (Pro-gated for AI mode, strict mode free)
- **Multi-Currency**: USD, EUR, GBP with live exchange rates
- **Export Options**: CSV, Moxfield, MTGO (Pro-gated for Moxfield/MTGO)
- **Price Snapshot Toggle**: Use historical prices vs. live prices

### 8. **Tools**

#### Probability Calculator (`/tools/probability`)
- **Combo Odds**: Calculate probability of drawing specific card combinations
- **Hypergeometric Calculator**: Multiple card probability calculations
- **Deep Linking**: Shareable URLs with preset calculations
- **Presets**: Common scenarios (turn 4 combo, opening hand specific cards)
- **Copy Summary**: Export calculation results

#### Mulligan Simulator (`/tools/mulligan`)
- **London Mulligan**: Full mulligan simulation
- **Opening Hand Testing**: Test keep/mulligan decisions
- **Deep Linking**: Shareable simulator states
- **Presets**: Common deck configurations
- **Local Persistence**: Saves preferences and recent tests

### 9. **Profile** (`/profile`)
- **Public Profile**: Customizable profile with banner art, color preferences, favorite commanders
- **Profile Customization**: 
  - Banner art (auto-generated from collection or fuzzy matched)
  - Color pie preferences (WUBRG selection)
  - Favorite commander selection
  - Signature deck (pinned deck shown on public profile)
  - Custom cards wallet (create and display custom MTG cards)
- **Badges**: Achievement system (Early Adopter, Pro Supporter, etc.)
- **Activity Feed**: Recent decks and collections with stats
- **Public Sharing**: Unique profile URLs (`/u/[username]`)
- **Pro Status**: Subscription management, billing portal access

### 10. **Browse Decks** (`/decks`)
- **Public Deck Discovery**: Browse all public decks
- **Filters**: Format, colors, date range, likes
- **Sorting**: Newest, most liked, trending
- **Deck Cards**: View full decklists with card images
- **Like System**: Free endorsement system for public decks
- **Deck Pages**: Individual deck detail pages with full analytics

### 11. **Blog** (`/blog`)
- **Articles**: Strategy guides, budget building tips, deck techs
- **Categories**: Strategy, Budget Building, Hidden Gems
- **SEO Optimized**: Individual article pages with metadata
- **Gradient Styling**: Beautiful article cards with animated icons

### 12. **Pricing** (`/pricing`)
- **Pro Subscription**: Monthly (£1.99) and Yearly (£14.99, 37% discount)
- **Feature Comparison**: 20+ Pro features vs. Free tier
- **Stripe Integration**: Secure checkout and billing portal
- **Feature Breakdown**: Detailed explanation of all Pro benefits

### 13. **Admin Dashboard** (`/admin/*`)
- **Ops & Safety**: Feature flags, kill switches, maintenance mode, budget caps
- **Data & Pricing**: Bulk import jobs (Scryfall, prices, snapshots), cache inspector
- **AI & Chat Quality**: Prompt library, metrics board, knowledge gaps, moderation
- **User Support**: User lookup, Pro toggle, account actions, GDPR tools
- **Observability**: Event stream, rate limits, error logs
- **Monetization**: Pro subscription tracker, growth metrics, conversion funnel
- **Security**: Audit logs, CSP tester, key rotation health
- **Backups**: Database backup management and restore procedures

---

## 💎 Pro Features (20 Total)

### Free Tier Limitations
- **Chat**: 50 messages per day
- **Custom Cards**: 5 saved cards
- **Basic Features**: View-only probability, basic budget swaps (strict mode)

### Pro Features (Monthly £1.99 / Yearly £14.99)
1. **Unlimited Chat Messages** - No daily limit
2. **AI-Powered Budget Swaps** - Smart alternatives with reasoning
3. **Export to Moxfield/MTGO** - Full format exports
4. **Fork Deck with Swaps** - Create optimized variants
5. **Explain Why** - Budget swap reasoning
6. **Price Tracker Watchlist** - Price alerts
7. **Price Tracker Deck Value** - Historical deck value tracking
8. **Fix Card Names** - Batch normalization
9. **Set to Playset** - Collection bulk operations
10. **Price Snapshot Refresh** - Force price updates
11. **Custom Cards** - 20 saved cards (vs. 5 free)
12. **Deck Versions** - Full version history
13. **Probability Helpers** - Full calculations (not view-only)
14. **Hand Testing Widget** - Interactive mulligan simulator
15. **Build Assistant Actions** - Balance curve, re-analyze
16. **Wishlist Advanced** - Batch fixes, advanced features
17. **Enhanced Analytics** - Advanced panels and insights
18. **Price History Charts** - Historical price tracking
19. **Priority Support** - Faster response times
20. **Pro Badge** - Show Pro status on profile

---

## 🔐 Authentication & User Management

### Authentication Flow
- **Email/Password**: Standard Supabase Auth
- **Email Verification**: Required for full access (with celebration popup)
- **Session Management**: Server-side session handling via Supabase SSR
- **Cookie Consent**: GDPR-compliant cookie banner (PostHog gated)

### User Data
- **Profiles**: Extended user metadata (color preferences, favorite commanders, Pro status)
- **Public Profiles**: Optional public-facing profiles with customization
- **GDPR Compliance**: Export and delete endpoints for user data
- **Admin Tools**: User lookup, Pro toggle, verification resend

---

## 📊 Analytics & Tracking

### PostHog Integration
- **Dual-Tracking System**: 
  - Client-side: Browser-based tracking (requires cookie consent)
  - Server-side: Always-on tracking for critical events (bypasses consent)
- **Key Events**:
  - `signup_completed`, `auth_login_success`, `email_verified_success`
  - `pricing_upgrade_clicked`, `deck_created`, `deck_liked`
  - Feature usage, tool interactions, conversion funnel
- **User Properties**: Pro status, deck count, collection value

### Admin Analytics
- **AI Usage Dashboard**: Token costs, model usage, spending vs. budget
- **Pro Subscription Stats**: Total Pro users, growth charts, plan breakdown
- **Error Monitoring**: Latest errors, rate limit violations
- **Event Stream**: Real-time admin audit log

---

## 💰 Monetization

### Stripe Integration
- **Subscriptions**: Recurring monthly/yearly billing
- **Webhooks**: Automated Pro status updates on payment events
- **Customer Portal**: Self-service billing management
- **Checkout**: Secure Stripe Checkout for new subscriptions
- **Payment Methods**: Credit cards, debit cards

### Revenue Features
- **Pro Subscriptions**: Primary revenue source
- **One-Time Donations**: Stripe payment links (footer, support widget)
- **Ko-fi Integration**: Alternative donation option
- **Support Widget**: Floating donation button (user-toggleable)

---

## 🛠️ Data Management

### Scryfall Integration
- **Bulk Import**: 110k+ MTG cards with full metadata (nightly job)
- **Cache System**: Local database cache for fast lookups
- **Image CDN**: Scryfall image URLs with caching
- **Price Data**: Real-time USD/EUR pricing updates (nightly job)
- **Metadata**: Card types, colors, rarity, sets, oracle text

### Price Tracking
- **Live Prices**: Real-time Scryfall API lookups
- **Historical Snapshots**: Daily price snapshots for trend analysis
- **Multi-Currency**: USD, EUR, GBP with exchange rate handling
- **Price Cache**: Optimized price lookups with TTL

### Automated Jobs
- **Job 1 (Bulk Scryfall)**: Downloads all 110k+ cards (monthly or on-demand)
- **Job 2 (Price Import)**: Updates prices for all cached cards (nightly)
- **Job 3 (Price Snapshots)**: Creates historical price records (nightly)
- **Execution**: GitHub Actions (automated) + Local admin panel (manual)

---

## 🎨 UI/UX Features

### Design System
- **Dark Mode**: Full dark theme with purple/blue accents
- **Gradient Styling**: Consistent gradient patterns across features
- **Responsive Design**: Mobile-first approach with Tailwind breakpoints
- **Loading States**: Skeleton loaders, progress bars, toast notifications
- **Error Handling**: User-friendly error messages with toast notifications

### Accessibility
- **Touch Targets**: 44px minimum for mobile (WCAG AAA)
- **Keyboard Navigation**: Full keyboard support
- **Screen Readers**: ARIA labels and semantic HTML
- **Color Contrast**: High contrast ratios for readability

### Mobile Optimizations
- **Chat Interface**: Full-height mobile layout, voice input, auto-scroll
- **Tool Strip**: Horizontal scrolling with snap points
- **Responsive Grids**: Adaptive layouts for small screens
- **Touch Interactions**: Proper touch feedback and gesture support

---

## 🔒 Security & Compliance

### Security Features
- **Row Level Security**: Supabase RLS policies on all tables
- **CSRF Protection**: Same-origin checks on mutating endpoints
- **Rate Limiting**: API rate limits (20 actions per 5 minutes for likes)
- **Input Validation**: Zod schema validation on all API inputs
- **CSP Headers**: Content Security Policy (report-only mode)

### GDPR Compliance
- **Cookie Consent**: Explicit consent banner for analytics
- **Data Export**: Complete user data export endpoint
- **Data Deletion**: Complete account deletion with cascade
- **Privacy Policy**: Comprehensive privacy page
- **Terms of Service**: Legal terms and refund policy

### Admin Security
- **Admin Authentication**: Environment-based admin user IDs/emails
- **Audit Logging**: All admin actions logged to `admin_audit` table
- **Feature Flags**: Kill switches for risky features
- **Maintenance Mode**: Read-only mode for updates

---

## 🚀 Performance Optimizations

### Frontend
- **Code Splitting**: Dynamic imports for heavy components
- **Image Optimization**: Lazy loading, WebP support
- **Virtual Scrolling**: Efficient rendering for large lists (1000+ items)
- **Caching**: Aggressive caching of Scryfall data
- **Bundle Size**: Tree-shaking, optimized imports

### Backend
- **Database Indexing**: Optimized queries with proper indexes
- **Batch Operations**: Bulk processing for imports
- **API Response Caching**: Cached responses where appropriate
- **Connection Pooling**: Efficient database connection management

---

## 📈 Growth & Marketing Features

### Social Features
- **Public Decks**: Share decks publicly with like system
- **Public Profiles**: Customizable shareable profiles
- **Deck Endorsements**: Like system for public decks
- **Activity Feed**: Shoutbox showing live user activity

### SEO
- **Dynamic Sitemap**: All public decks included (500+ routes)
- **OpenGraph Tags**: Social media preview cards
- **Structured Data**: JSON-LD schema markup
- **Meta Descriptions**: Optimized per-page descriptions

### Content Marketing
- **Blog System**: Strategy articles, budget guides, deck techs
- **Changelog**: Public changelog showing feature updates
- **Support Page**: Comprehensive help and contact information

---

## 🔧 Developer Experience

### Code Quality
- **TypeScript**: Full type safety
- **ESLint**: Code linting with custom rules
- **API Envelopes**: Unified `{ ok, error? }` response format
- **Zod Validation**: Runtime type checking for API inputs
- **Error Boundaries**: React error boundaries with PostHog reporting

### Testing
- **Unit Tests**: Color pie, canonicalization, assistant helpers
- **E2E Tests**: Playwright tests for critical flows
- **Smoke Tests**: Basic functionality validation
- **API Tests**: Endpoint validation

### Documentation
- **Tech Stack Docs**: Comprehensive integration documentation
- **Feature Tracker**: Detailed feature implementation log
- **API Documentation**: Endpoint descriptions and patterns
- **Admin Guides**: Setup and troubleshooting documentation

---

## 🎯 Key Differentiators

1. **AI-Powered Analysis**: GPT-5 integration for intelligent deck suggestions
2. **Real-Time Pricing**: Live Scryfall pricing with historical tracking
3. **Comprehensive Tools**: Probability, mulligan, cost optimization all in one place
4. **Budget Focus**: Strong emphasis on budget optimization and cost-to-finish
5. **Social Features**: Public decks, profiles, likes, activity feed
6. **Mobile-First**: Excellent mobile experience with voice input
7. **Pro Features**: 20+ Pro features for power users
8. **Automated Data**: Fresh card data and pricing updated nightly

---

## 📝 Future Roadmap Ideas

- **Progressive Web App**: Installable app with offline support
- **OAuth Integration**: Google/Discord login options
- **Deck Sharing**: Enhanced sharing with embedded previews
- **Tournament Tracker**: Track tournament results and meta shifts
- **Collection Sync**: Import from Arena, MTGO, other platforms
- **Advanced Analytics**: More detailed deck performance metrics
- **Community Features**: Deck comments, ratings, discussions
- **Mobile App**: Native iOS/Android apps

---

This overview provides a comprehensive picture of ManaTap AI's architecture, features, and capabilities. The platform is production-ready with a solid foundation for continued growth and feature development.

