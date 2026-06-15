# Frontend changelog

## 2026-06-15

### Hybrid homepage preview (`/new-home`)

- **Route:** New experimental homepage at `/new-home` (Concept 10 hybrid layout) — `robots: noindex` until owner approves root swap.
- **Layout:** Hero with tool discovery CTAs, six pillar tiles (Build / Improve / Track / Play / Discover / AI), popular tools grid, trending section (reuses `MetaDeckPanel`, `RecentPublicDecks`, `PopularCommanderGuides`), mobile app section, trust feature row.
- **Polish pass:** Stronger hero copy; **Why ManaTap?** scan section; mobile app moved below hero (iOS live, Android coming soon — no live Play button); phone-frame tool showcase; pillar icons + AI highlight; popularity badges on select tools; commander-first trending (`TrendingCommandersStrip` marketing mode); capability trust row with optional live public-deck count from meta API; Meta Snapshot lists no longer show per-commander `N new` / `N decks` counts.
- **Layout refinement:** Desktop drops large app showcase; mobile-only compact install banner after hero (`HomeMobileInstallBanner` + `useHomeMobilePlatform`). Section order: Hero → (mobile install) → Problem Finder → Why ManaTap → Categories → Popular Tools → Trending.
- **Problem finder (Concept 8 merge):** New `HomeProblemFinder` section with six problem-first cards (`HOME_PROBLEM_FINDER` in config) — weak deck, too expensive, need commander, bad mana, collection help, MTG question — each with accent colour, primary link, and tool chips.
- **Compact pass:** `HomePillarGrid` and `HomeWhyManaTap` tightened to reduce page length below the new onboarding block.
- **Pillar pills:** Each workflow link pill in `HomePillarGrid` has its own accent color (configured via `pillClass` on `HOME_PILLARS` links).
- **Removed:** `HomeTrustRow` (“Built for real MTG workflows” capability checklist) dropped from `/new-home` layout.
- **Commander guides:** Rotating flagship guide pill (`HomeCommanderGuideRotator`) replaces static box in trending grid; shared `FLAGSHIP_COMMANDER_GUIDES` in `lib/home/commanderGuides.ts` (also used by `PopularCommanderGuides`).
- **Meta Snapshot:** Trending card thumbnails with click-to-open `WebsiteCardDetailModal` (images via `/api/cards/batch-images`).
- **Config:** Pillar and tool link data centralized in `lib/home/homeConfig.ts`; Deck Checker label used (not “Analyze a Deck”); Life Counter omitted (no web route); AI Chat links to `/` until Phase 4; `ANDROID_APP_LIVE` flag for pre-launch Android.
- **Unchanged:** Root `/` remains chat-first homepage; no API/backend/mobile changes.
- **Files:** `app/new-home/page.tsx`, `components/home/*`, `components/MetaDeckPanel.tsx`, `components/PopularCommanderGuides.tsx`, `components/TrendingCommandersStrip.tsx`, `lib/home/homeConfig.ts`, `lib/home/commanderGuides.ts`, `lib/home/useHomeMobilePlatform.ts`.

### Tools hub fixes (audit follow-up)

- **Route:** `GET /analyze` redirects to `/mtg-deck-checker` via `app/analyze/route.ts` GET handler; `POST /analyze` unchanged (legacy re-export of `/api/deck/analyze` — mobile uses `/api/mobile/deck/analyze`).
- **Route:** New `GET /roast` page with inline `DeckRoastPanel` (hub link no longer 404).
- **Hub:** Deck Compare badge corrected to **Sign in** (guests see signup wall).
- **Deck Checker UX:** Three-phase loading (reading list → identifying cards/format → running check); commander confirm gate; passes `commander` to analyze API; honest “Detailed” result copy.
- **Deck Checker preview:** Diagonal example ribbon on verdict panel; analyzing overlay; spring pop-in when live results arrive; grade badge shifts cyan for real output.
- **Roast:** Standalone `/roast` opens form expanded; commander must be picked from search; confirmed commander shows art pill with Change (homepage modal + standalone).
- **Fix:** Commander autocomplete on Roast (homepage modal + `/roast`) — Scryfall API calls now send required `User-Agent` header; stale empty commander cache busted (`v2` key); suggestion list stays open until user picks.
- **Roast UX:** Picked commander shows art-only thumbnail (click opens `WebsiteCardDetailModal`); standalone `/roast` adds saved-deck picker for signed-in users.
- **Tool deck pickers:** Saved-deck selectors on Roast (standalone), AI Workshop, Deck Checker, and Mulligan hide decks below halfway minimum (50 Commander / 30 other formats), aligned with mobile app rules.
- **Files:** `app/analyze/route.ts`, `app/roast/page.tsx`, `app/tools/page.tsx`, `app/mtg-deck-checker/DeckCheckerClient.tsx`, `components/DeckRoastPanel.tsx`, `components/CardAutocomplete.tsx`, `components/tools/EligibleSavedDeckSelect.tsx`, `components/ai-workshop/WorkshopDeckLoader.tsx`, `components/mulligan/MulliganDeckInput.tsx`, `app/ai-workshop/Client.tsx`, `app/api/cards/search-commanders/route.ts`, `app/api/cards/search/route.ts`, `lib/server/scryfallApi.ts`, `lib/deck/tool-deck-eligibility.ts`, `hooks/useEligibleSavedDecks.ts`, `tests/unit/tool-deck-eligibility.test.ts`, `lib/deck/deck-checker-prep.ts`, `tests/unit/deck-checker-prep.test.ts`.

- **Reliability:** `/api/deck/swap-suggestions` retries failed/invalid AI responses once (plus `retryOn429` / `retryOn5xx` on LLM client).
- **Quality:** Blink/ETB engines (Thassa, Brago, Displacer Kitten, etc.) blocked as swap `from` cards server-side and in AI prompt; mobile response shape unchanged (`ok`, `suggestions`, `currency`, `budget`).
- **Files:** `app/api/deck/swap-suggestions/route.ts`, `lib/deck/protected-role-cards.ts`, `lib/deck/budget-swap-guards.ts`, `tests/unit/swap-suggestions-protected.test.ts`.

- **UX:** AI failures (`ai_call_failed`, `ai_invalid_response`) show error modal with retry; empty AI outcomes distinguish "no suggestions" vs "filtered out".
- **API:** `emptyReason` + `stats.ai` on `/api/deck/swap-suggestions`; removed duplicate standalone AI retry.
- **Files:** `app/api/deck/swap-suggestions/route.ts`, `app/deck/swap-suggestions/Client.tsx`, `lib/deck/swap-suggestions-empty-reason.ts`, `tests/unit/swap-suggestions-empty-reason.test.ts`.

### Budget Swaps — remove threshold, fix Pro AI swaps

- **UX:** Removed the min card price threshold from Budget Swaps — paste deck, pick mode, Compute.
- **Fix (Pro AI):** AI prompt no longer caps replacements at the threshold (was blocking swaps like Sea of Clouds → cheaper land at £10+). AI standalone always allows replacements cheaper than the original only.
- **Fix:** `isValidBudgetSwap` threshold-0, tag/role filter wipe, quick-swap pricing scope, error modal — see prior entries this date.
- **Files:** `app/deck/swap-suggestions/Client.tsx`, `app/deck/swap-suggestions/layout.tsx`, `app/api/deck/swap-suggestions/route.ts`, `lib/deck/budget-swap-guards.ts`.

### Budget Swaps — threshold 0 and empty states

- **Fix:** `isValidBudgetSwap` no longer requires replacements to cost £0 when threshold is 0 (was blocking every swap).
- **Fix:** Tag/role filters on `/api/deck/swap-suggestions` keep prior suggestions when filtering would return none (standalone page no longer wiped to empty).
- **Fix:** Quick Swaps only prices cards with curated swap entries (avoids timing out on large decks); returns `no_curated_sources_in_deck` when the list has no curated staples.
- **UX:** No-results modal and inline banner use mode-aware copy; threshold-0 no longer suggests "raise threshold"; API/network failures show an error modal with retry; errors show in empty results panel.
- **Files:** `lib/deck/budget-swap-guards.ts`, `app/api/deck/swap-suggestions/route.ts`, `app/deck/swap-suggestions/Client.tsx`, `tests/unit/swap-suggestions-budget.test.ts`.

## 2026-06-14

### iOS App Store review → Discord alerts

- **Cron:** Apple review poll interval **15m → 5m** (Apple has no review webhook; polling only).
- **Fix:** App Store Connect JWT now signs ES256 with IEEE P1363 (`r||s`) — fixes Apple `properly configured and signed bearer token` errors from DER-encoded signatures.
- **Files:** `lib/apple-app-store/createAppStoreConnectJwt.ts`, `tests/unit/apple-app-store-jwt.test.ts`.

- **Cron:** `POST`/`GET` `/api/cron/apple-reviews` polls App Store Connect `customerReviews`, dedupes in `app_store_review_notifications`, posts new written reviews to Discord.
- **Auth:** `Authorization: Bearer` with `APP_REVIEW_ALERT_SECRET` (accepts `CRON_SECRET` for Vercel Cron).
- **Safety:** Empty-table bootstrap seeds without Discord; `?dryRun=1` for testing.
- **Docs:** `docs/apple-review-discord-alerts.md`, `frontend/docs/CRONS.md`, migration `144_app_store_review_notifications.sql`.
- **Files:** `app/api/cron/apple-reviews/route.ts`, `lib/apple-app-store/*`, `lib/server/verifyAppReviewAlertRequest.ts`.

## 2026-06-13

### RevenueCat webhook — anonymous app_user_id (Sentry JAVASCRIPT-NEXTJS-36)

- **Fix:** Skip profile updates when `app_user_id` is not a Supabase UUID (e.g. `$RCAnonymousID:…`); acknowledge webhook with 200 instead of Postgres UUID errors.
- **Files:** `app/api/revenuecat/webhook/route.ts`, `lib/revenuecat/app-user-id.ts`.

## 2026-06-12

### Support — single public inbox

- **Aligned** `/support`, `/terms`, and support form fallback to **`support@manatap.ai`** (removed `davy@` and `prosupport@` from user-facing copy).
- **Files:** `lib/support-email.ts`, `app/support/page.tsx`, `app/terms/page.tsx`, `components/SupportForm.tsx`.

### Marketing Radar — ELI5 copy on Summary and all steps

- **Plain English:** Renamed jargon sections (Primary CTA → “Where to send players”, Attribution explained, UTM hidden by default), expanded ELI5 on all four tabs, “Your move” callout on Summary.
- **Files:** `SummaryTab.tsx`, `IngestTab.tsx`, `PublishTab.tsx`, `MarketingRadarTabs.tsx`, `AdminHelp.tsx` (`SectionCaption`), `page.tsx`.

### Marketing Radar — CTA, UTM, SEO, attribution

- **Primary CTA:** Each brief stores `primary_cta`, `content_format`, `seo_target_keyword`, `social_repurpose` (migration `143_marketing_radar_cta_seo.sql`).
- **UTM:** `lib/marketing/marketingUtm.ts` appends `utm_campaign=radar-YYYY-MM-DD` (+ platform source/medium) to draft manatap.ai links; `campaign` column on drafts.
- **Product-led playbooks:** AI picks one format (`roast_hook`, `swap_spotlight`, etc.); expanded link catalog + commander deep links.
- **Blog SEO:** `validateBlogSeo.ts` flags thin/missing H1/internal links; blog prompt requires SEO structure + repurpose bullets.
- **Summary tab:** Primary CTA card, PostHog attribution panel (14d signups/pro), collapsible repurpose copy.
- **Publish tab:** Campaign slug + utm_source shown per draft.
- **API:** `GET /api/admin/marketing-radar/briefs/[id]/attribution` (HogQL; needs `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID`).
- **Files:** `lib/marketing/marketingUtm.ts`, `marketingCommanderLinks.ts`, `validateBlogSeo.ts`, `processBriefDrafts.ts`, `generateMarketingBrief.ts`, `createBriefAndDrafts.ts`, `SummaryTab.tsx`, `PublishTab.tsx`, `docs/MARKETING_RADAR.md`.

### Moderation — Discord alerts for new reports

- **`POST /api/moderation/reports`:** After a report is saved, sends a Discord message with type, reason, resource, and direct link to `https://www.manatap.ai/admin/moderation?report_id=…`. Failure does not block submission.
- **`/admin/moderation`:** Honors `?report_id=` to auto-select a report from Discord links.
- **Env:** `DISCORD_MODERATION_WEBHOOK` (falls back to `DISCORD_ADMIN_ALERT_WEBHOOK` / `DISCORD_WEBHOOK_URL`).
- **Files:** `lib/admin/notifyModerationReport.ts`, `app/api/moderation/reports/route.ts`, `docs/MOBILE_ADMIN_CONTROL.md`.

### Admin — remove unused pages

- **Removed:** `/admin/feedback-dashboard`, `/admin/feature-flags`, `/admin/mulligan-analytics` and `GET /api/admin/feedback-dashboard`.
- **Nav:** Admin hub, command center, mobile command center links updated; feature-flag counts remain on mobile command center (no dedicated page).
- **Note:** `POST/GET /api/admin/mobile/feature-flags` and `/api/admin/mulligan/analytics` remain for API/SQL workflows.

### Admin — remove unused pages (earlier)

- **Removed:** `/admin/analytics-seed`, `/admin/obs`, `/admin/deploy`, `/admin/route-health` and `GET /api/admin/route-health`.
- **Nav:** Admin hub + command-center command map links updated; `lib/admin/route-catalog.ts` groups trimmed.
- **Note:** `/api/admin/audit`, `errors`, `rate-limits` remain (used by `/admin/security`, ops pinboard).

### Blog — SQL-first publishing (website + mobile)

- **Shared publish:** `lib/blog/publishBlogPost.ts` writes `app_config.blog` + `blog_marketing_bodies`; used by Admin Blog, Marketing Radar, and SQL generator.
- **Reader:** `getDbBlogPost()` (alias `getMarketingBlogPost`); ISR `revalidate = 300` on `/blog/[slug]`.
- **SQL generator:** `scripts/generate-blog-sql.mjs` + `docs/BLOG_SQL_PUBLISH.md`.
- **Admin Blog:** markdown body per entry, Save publishes both keys, **Copy SQL** per post; `GET/POST /api/admin/blog` + `POST /api/admin/blog/sql`.
- **Marketing Radar:** blog publish accepts slug/category/gradient/icon overrides; **Copy SQL** on publish tab.
- **Sitemap:** unions DB blog slugs with `DEFAULT_BLOG_POSTS`.
- **Marvel post body migration:** `db/migrations/110b_blog_marvel_precon_body.sql` (run in Supabase if article 404).
- **Docs:** `HOW_TO_ADD_BLOGS_AND_CHANGELOGS.md`, `docs/BLOG_SOURCES_OF_TRUTH_AUDIT.md`, `MARKETING_RADAR.md`, cursor rules.

### Blog — Marvel Commander precon upgrades

- **New post:** *How to Upgrade Marvel Commander Precons Without Losing the Theme* (`/blog/upgrade-marvel-commander-precons-without-losing-theme`).
- **Files:** `lib/blog-defaults.ts`, `app/blog/[slug]/page.tsx`, `db/migrations/110_blog_marvel_precon_upgrades.sql`, `110b_blog_marvel_precon_body.sql`.

## 2026-06-11

### Email verification — success page on any device/browser

- **Fix:** Signup `emailRedirectTo` now points at `/auth/callback?next=/auth/confirmed?verified=1` so PKCE verification links show the confirmation screen (not a silent homepage).
- **Fix:** Middleware forwards stray `?code=` on non-callback pages to `/auth/callback` with the same success `next` (covers older emails that landed on Site URL).
- **UX:** Hash-based confirm links append the verified email to `/auth/confirmed`; signup modal adds **Confirm password** (must match).
- **Files:** `lib/auth/emailVerificationRedirect.ts`, `middleware.ts`, `app/auth/callback/route.ts`, `components/HashAuthCallbackHandler.tsx`, `components/Header.tsx`, `components/InlineSignUpForm.tsx`, `components/EmailVerificationSuccessPopup.tsx`.

### Admin support — subscription & transfer details

- **User Support** (`/admin/support`): selecting a user loads subscription support — effective Pro, profile vs RevenueCat mismatches, store subs (sandbox/App Store/Play), auth providers, TRANSFER/EXPIRATION/RENEWAL rows from `admin_audit`.
- **API:** `GET /api/admin/users/subscription-support?userId=`.
- **Search:** Pro column uses `resolveServerEffectiveIsPro`; includes `pro_until`.
- **Files:** `app/admin/support/page.tsx`, `lib/admin/subscription-support.ts`, `app/api/admin/users/subscription-support/route.ts`, `app/api/admin/users/search/route.ts`.

### Pro status — stale profile vs RevenueCat (server)

- **Fix:** `checkProStatus` and `/api/user/pro-status` now use `resolveServerEffectiveIsPro` — manual/Stripe grants preserved; when RevenueCat REST reports an inactive store sub, stale `profiles.is_pro` no longer grants API Pro (aligns with mobile).
- **Admin debug:** `getEntitlementDebugForAdmin` uses the same resolver; mismatch flag when profile Pro but RC inactive.
- **Files:** `lib/server-pro-check.ts`, `tests/unit/server-pro-check.test.ts`.

### RevenueCat TRANSFER — revoke donor accounts

- **Fix:** `TRANSFER` webhook grants `transferred_to` and revokes `transferred_from` Supabase UUIDs (skips `$RCAnonymousID`); same manual/Stripe skip guards as EXPIRATION.
- **Refactor:** Shared `getRevenueCatRevokeSkipReason` for EXPIRATION and transfer revoke.
- **Files:** `app/api/revenuecat/webhook/route.ts`.

### Password reset — wrong account when already logged in

- **Fix:** `/account/update-password` signs out any existing local session before exchanging a PKCE `?code=` or hash recovery token, so reset links always target the emailed account (not whoever is logged in on that browser profile).
- **UX:** Form shows “Setting password for **email**” after the link is validated; visiting the page without a recovery link shows invalid/expired (not a logged-in password change).
- **Hash links:** `HashAuthCallbackHandler` also signs out locally before `setSession` on `type=recovery`.
- **Files:** `app/account/update-password/page.tsx`, `components/HashAuthCallbackHandler.tsx`.

### Marketing Radar manual X/Instagram

- **Publish tab → Copy & post:** X and Instagram are clipboard + manual post (no paid X API). Blog still has one-click publish to manatap.ai.
- **PATCH:** `mark_posted` sets `posted` status + `posted_at` for manual tracking.
- **Files:** `PublishTab.tsx`, `publishMarketingDraft.ts`, `marketing-drafts/[id]/route.ts`, docs.

### Marketing Radar 4-step publish flow

- **UI:** Four tabs — Ingest → Summary → Drafts (approve/reject) → Publish (Post to X / Instagram / blog).
- **AI:** Exactly one draft per platform; blog is long-form (800–1500 words).
- **Publish:** `POST /api/admin/marketing-drafts/[id]/publish` + `lib/marketing/publish/*`; dynamic blog posts via `app_config`.
- **Cron:** `marketing-radar-review` every 2 days — ingest + brief + Discord link to approve.
- **Migration:** `141_marketing_radar_publish_flow.sql` (`posted` status, one active draft per platform).
- **Files:** `app/admin/marketing-radar/page.tsx`, `components/admin/marketing-radar/*`, `lib/marketing/publish/*`, `app/blog/[slug]/page.tsx`, `vercel.json`, `docs/MARKETING_RADAR.md`.

### Marketing Radar draft voice + links

- **AI prompts:** Audience-facing posts (not signal reports); required manatap.ai links from `marketingPublicLinks.ts` catalog.
- **Quality flags:** `analyst_voice`, `missing_link` on X/Instagram/blog drafts.
- **Files:** `lib/marketing/generateMarketingBrief.ts`, `marketingPublicLinks.ts`, `checkDraftQuality.ts`.

### Marketing Radar UX + Reddit script auth

- **UI:** Tabbed flow — Start here, Collect topics, AI drafts, Post & schedule, Setup (ELI5 on each tab).
- **Reddit:** Script-app password grant (`REDDIT_USERNAME`, `REDDIT_PASSWORD`); Setup tab with developer portal guidance.
- **Files:** `app/admin/marketing-radar/page.tsx`, `components/admin/marketing-radar/*`, `lib/marketing/redditOAuth.ts`.

### Marketing Radar source fixes

- **Migration:** `140_marketing_radar_source_fixes.sql` — disable broken Wizards RSS; fix MTGGoldfish feed URL; enable Commanders Herald; correct YouTube channel IDs (EDHRECast, Nitpicking Nerds).
- **Reddit:** OAuth `client_credentials` via `lib/marketing/redditOAuth.ts` (`REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`); unauthenticated JSON no longer used.
- **YouTube:** optional `forHandle` resolution when `channelId` missing in source metadata.
- **UI:** amber banner when Reddit API credentials missing.
- **Files:** `lib/marketing/redditOAuth.ts`, `fetchRedditSignals.ts`, `fetchYouTubeSignals.ts`, `IngestActions.tsx`, `MARKETING_RADAR.md`.

### Marketing Radar phases 2–10

- **Migration:** `139_marketing_radar_phase2.sql` — source fetch metadata, draft calendar/export/quality fields, RSS/YouTube/Reddit seeds.
- **Ingestion:** RSS, YouTube (known channels), Reddit (read-only hot posts); scoring + topic detection + scryfall card verify.
- **APIs:** ingest/rss|youtube|reddit, daily-run, briefs/[id], regenerate, export.csv; cron `GET /api/cron/marketing-radar-daily` (06:30 UTC).
- **UI:** Fetch buttons, brief history, signal/draft filters, copy actions, calendar view, quality warnings.
- **Docs:** `frontend/docs/MARKETING_RADAR.md`, `docs/SUPABASE_SCHEMA.md`, `frontend/docs/CRONS.md`.

### Marketing Radar MVP (admin)

- **Database:** Migration `138_marketing_radar.sql` — `marketing_sources`, `marketing_signals`, `marketing_briefs`, `marketing_drafts` (service-role-only RLS).
- **Admin UI:** `/admin/marketing-radar` — manual signal paste, meta context preview, latest brief, drafts by platform (approve/reject/edit/save).
- **APIs:** `GET /api/admin/marketing-radar`, `POST /api/admin/marketing-radar/run`, `POST /api/admin/marketing-radar/signals`, `PATCH /api/admin/marketing-drafts/[id]`.
- **AI:** `lib/marketing/generateMarketingBrief.ts` blends manual signals + `meta_signals` snapshot; no auto-posting.
- **Docs:** `frontend/docs/MARKETING_RADAR.md`, `docs/SUPABASE_SCHEMA.md` (Marketing Radar section).
- **Files:** `app/admin/marketing-radar/page.tsx`, `app/api/admin/marketing-radar/**`, `app/api/admin/marketing-drafts/[id]/route.ts`, `lib/marketing/*`, `lib/admin/route-catalog.ts`, `app/admin/JustForDavy/page.tsx`.

## 2026-06-09

### Audit remediation (security, performance, UX)

- **Security:** Admin route gates (`events/summary`, scryfall-cache, snapshots/info, backfill-commanders); production fail-closed for `GUEST_TOKEN_SECRET` / `REVENUECAT_WEBHOOK_AUTH`; blog `sanitizeBlogHtml`; collection upload hardening; `/api/me/analytics-context`; fanout rate limits; CSRF on key mutating routes.
- **Features:** `POST /api/decks/fork-with-swaps` (Pro); browse age/budget filters; `/wishlist` link fixes; profile cleanup (dead wishlist editor removed).
- **Performance:** `GET /api/collections/summary`; homepage static shell; public profile ISR (`revalidate=60`); sitemap `revalidate=3600`.
- **Quality:** `types/api.ts`, `lib/api/schemas.ts`, `parseApiResponse`, route loading/error boundaries, Sentry/PostHog on errors, `scripts/verify-admin-routes.ts`.

### Sentry production fixes (website)

- **NEXTJS-2 / NEXTJS-35:** Fixed mobile hydration mismatch on `/my-decks/:id` — `DeckCardRecommendationsWithHide` in `DeckSidebar.tsx` now uses SSR-safe `useState(true)` + post-mount viewport check instead of `window.innerWidth` in the initializer.
- **NEXTJS-32:** Replaced top-level JSON-LD arrays with `@graph` wrapper on `/build-a-deck` and `/mtg-deck-checker` (Safari `@context.toLowerCase` parse error).
- **NEXTJS-2Y:** Homepage commander strips batch art via single `POST /api/cards/batch-images` (`lib/commander-art-batch.ts`); removed browser-side Scryfall fuzzy fallback from `lib/scryfall-cache.ts`.
- **NEXTJS-2X:** Added Sentry `beforeSend` filter for Linux Chrome `head > link` promise rejections on `/cards/*` (bot/crawler noise).
- **E2E:** Mobile viewport hydration check in `tests/e2e/deck-management.spec.ts`.
- **Files:** `app/my-decks/[id]/DeckSidebar.tsx`, `app/build-a-deck/page.tsx`, `app/mtg-deck-checker/page.tsx`, `lib/commander-art-batch.ts`, `lib/scryfall-cache.ts`, `components/TrendingCommandersStrip.tsx`, `components/PopularCommanderGuides.tsx`, `instrumentation-client.ts`, `docs/SENTRY_PRODUCTION_INVESTIGATION_2026-06-09.md`.

### Sentry production investigation (read-only)

- Documented root-cause analysis for four unresolved `javascript-nextjs` issues: JSON-LD Safari parse error (NEXTJS-32), my-decks mobile hydration (NEXTJS-2/35), homepage Scryfall N+1 (NEXTJS-2Y), cards slug link rejections (NEXTJS-2X).
- **Files:** `docs/SENTRY_PRODUCTION_INVESTIGATION_2026-06-09.md`.

## 2026-06-08

### AI Workshop QA fixes

- **Eval harness:** `--db-decks` auto-classifies `expectedLegality` via `assessWorkshopSourceDeck`; repair underfill summaries no longer false-fail; budget eval uses `budgetLevelToSwapThreshold("Moderate")`; Teysa `add_interaction` regression pin; budget 504 noted as hard fail.
- **Budget swaps:** Workshop budget path now falls back to `addAiSuggestions` when deterministic builtins return zero; returns `emptyReason: "no_cheaper_on_plan_swaps"`; tier-aware empty copy in Client + amber preview panel.
- **Why fallback:** `buildFallbackWhyPayload` synthesizes per-card `changeReasons` when explanation generation fails.
- **Source preflight:** `POST /api/deck/workshop-preflight` + `WorkshopSourceWarningGate` with debounced checks before destructive passes.
- **General cleanup guard:** `NEEDS_LEGALITY_FIRST` blocks general cleanup on broken sources; Client redirects to Fix legality.
- **Model tuning:** Light-touch prompt rule + `max_completion_tokens` 4500 when `maxChanges <= 12`.
- **Libs/tests:** `lib/deck/workshop-source-assessment.ts`, `lib/deck/transform-why-fallback.ts`; unit tests for assessment + why fallback.

### AI Workshop (website)

- **`/ai-workshop`:** New full-parity AI Workshop tool — load/paste a deck, run 8 refinement passes (general, mana, curve, interaction, budget, power, casual, legality), review selective adds/cuts or budget swaps, undo, and save refined deck. Sign-in required to run; free 5 passes/day; Pro unlimited + Big rebuild.
- **AI Workshop polish:** Pass pills use distinct accent colors per pass; loaded-deck chips are color-coded; pasted/saved deck art uses `banner-art` + cache-backed `getImagesForNames` (same pattern as budget swaps) with first-line commander fallback.
- **Tools hub:** AI Workshop is the first card in **Improve Your Deck** on `/tools`.
- **Entry points:** My Decks Build Assistant (`?deckId=`), Deck Checker handoff via sessionStorage, Budget Swaps related tools link.
- **Redirect:** `/tools/ai-workshop` → `/ai-workshop`.
- **Libs:** `lib/deck/ai-workshop-{deck-text,rules,actions,helpers}.ts`, `lib/deck/preview-facts-adapter.ts`, `components/ai-workshop/*`.
- **Tests:** `tests/unit/ai-workshop-deck-text.test.ts`, `tests/unit/ai-workshop-rules.test.ts`; E2E route list includes `/ai-workshop`.

### AI Workshop transform output correctness

- **`POST /api/deck/transform`:** Final validation now runs after Workshop enforcement/restoration so banned cards and Commander off-color cards cannot be reintroduced by max-change, budget, or commander-package guards.
- **Constructed sideboards:** Transform responses preserve source sideboards by appending a `Sideboard` section to `deckText`; preview facts are computed from the mainboard only.
- **Commander cleanup:** Duplicate commander rows are normalized to one copy.

## 2026-06-03

### Website changelog - mobile app Android/iOS progress

- **Migration `127_changelog_mobile_app_android_ios_may_2026.sql`:** Adds a public `/changelog` entry for May 2026 highlighting how far the ManaTap app has come across Android and iOS: scanner improvements, build-from-collection, voice-ready Life Counter, collection/wishlist management, guest deck building, deck chat apply/undo, and broader app polish.
- **Docs checked:** `docs/HOW_TO_ADD_BLOGS_AND_CHANGELOGS.md`, `docs/CHANGELOG_SQL_GUIDE.md`, and `docs/MOBILE_ADMIN_CONTROL.md`.

## 2026-05-30

### Ops - daily digest website AI cost estimate

- **`lib/ai/pricing.ts`:** Added cached-input-aware pricing helper alongside the existing token pricing table.
- **`lib/ops/run-ops-report.ts`:** Daily digest AI cost now applies OpenAI org usage cached-input discounts by model when admin usage data is available, instead of treating every input token as full-price.
- **`app/api/admin/ai/openai-usage/route.ts`:** Admin OpenAI usage fallback estimate now includes cached input tokens and returns naive-vs-cached totals for easier sanity checks.
- **`tests/unit/pricing.test.ts`:** Added coverage for cached input pricing math.

## 2026-05-31

### Ops - live OpenAI costs in admin + Discord

- **`lib/ai/openai-org-usage.ts`:** New shared OpenAI org spend helper using the live Usage + Costs APIs, with project-aware daily cost buckets, latest completed UTC day, and month-to-date totals.
- **`app/api/admin/ai/openai-usage/route.ts`:** Admin AI usage now returns live OpenAI daily/project spend plus month-to-date actuals.
- **`app/admin/ai-usage/page.tsx`:** OpenAI panel now shows latest completed UTC day, month-to-date actual spend, project names, and an actual-cost chart.
- **`lib/ops/run-ops-report.ts` / `lib/ops/discord.ts`:** Daily Discord digest now includes live OpenAI actual spend lines alongside internal per-surface estimates.
- **`app/api/admin/audit-pinboard/route.ts` / `app/admin/ops/page.tsx`:** Ops pinboard AI spend now uses live OpenAI costs when available and shows the spend basis.

## 2026-05-29

### Main chat — deck analysis intent, commander, send button

- **Removed** hardcoded Maralen/Muldrotha canned replies that fired when those card names appeared inside pasted lists (`/api/chat` fallback path).
- **`buildSafeGeneralChatAnswer`:** Skips all keyword shortcuts for pasted decklists and `analyse this` requests.
- **`buildDirectDeckContextAnswer`:** No longer returns a one-line “quick health check” for explicit deck-analysis asks (full LLM analysis instead).
- **`decklistDetector`:** Recognizes `the commander is …` (not only `my commander is`).
- **`enhancements`:** Better land counting for duals/triomes in pasted lists (fixes bogus “13 lands” in prompts).
- **`layer0-gate`:** Added `classifyChatTurnIntent`; pasted lists and analysis asks route to **FULL_LLM**.
- **`Chat.tsx`:** `streamInFlight` keeps Send disabled until the stream fully finishes; clears stuck `activeStreamingRef` in `finally`.
- **Files:** `app/api/chat/route.ts`, `lib/chat/orchestrator.ts`, `lib/chat/decklistDetector.ts`, `lib/chat/enhancements.ts`, `lib/ai/layer0-gate.ts`, `components/Chat.tsx`, `tests/unit/chat-orchestrator.test.ts`.

### Main chat — bogus "I couldn't resolve …" legality replies

- **`lib/chat/orchestrator.ts`:** Strategy/deck-discussion messages no longer trigger the legality short-circuit (`format` + `have` heuristic removed). Card-name extraction no longer treats English phrases after `is` / `play` as card names. Direct legality answers only return when cards resolve in cache and the user asked an explicit legality question.
- **Files:** `lib/chat/orchestrator.ts`, `tests/unit/chat-orchestrator.test.ts`.

### Main chat — Send button stuck after stream / stop

- **`lib/threads.ts`:** `postMessageStream` / debug variant now resolve only after the client pacer finishes (or aborts), so `send()` does not clear `busy` while `activeStreamingRef` still blocks the next message.
- **`lib/streaming-pacer.ts`:** Added `abortAndFlush()` so partial streamed text is preserved when the user stops generation.
- **`components/Chat.tsx`:** Stop no longer hides the stream overlay before abort cleanup; `newChat()` resets streaming guards; user stop shows "(Generation stopped)" when no text was emitted.
- **Files:** `lib/threads.ts`, `lib/streaming-pacer.ts`, `components/Chat.tsx`.

### Cards SEO — static generation / Sentry

- **`/cards/[slug]`:** Use `createClientForStatic()` for metadata, price cache, and public custom-card reads so `generateStaticParams` no longer hits `cookies()` during build (fixes Sentry `JAVASCRIPT-NEXTJS-2Z` / `JAVASCRIPT-NEXTJS-Q`).
- **Private custom cards:** Owner UUID preview still falls back to session `createClient()` when anon lookup misses.
- **Files:** `app/cards/[slug]/page.tsx`.

### Unified AI feedback

- **Migration `117_ai_feedback_events.sql`:** New **`ai_feedback_events`** table (service-role inserts from API).
- **`POST /api/ai/feedback`:** Zod-validated unified endpoint; guests may submit issue reports (full report context + `guest_key`, no `user_id`); guest thumbs-only still omit transcript text.
- **`/api/feedback`**, **`/api/chat/report`:** Delegate AI flows to unified store (no new **`ai_response_reports`** writes).
- **Admin `/admin/ai-feedback`:** List, filters (24h/2d/7d/all), detail drawer, grouping, JSON export for Cursor.
- **Web:** `Chat.tsx`, `AnalysisFeedbackRow.tsx` use unified API.
- **Docs:** `docs/SUPABASE_SCHEMA.md`, `lib/ai/app-feature-labels.ts`.

## 2026-05-28

### Ops — daily Discord digest AI cost/call accuracy

- **`lib/ops/run-ops-report.ts`:** Daily digest now counts **billable LLM calls only** (excludes `model=none` / zero-cost rows and `ai_test` / eval rows), sums `cost_usd + planner_cost_usd`, and labels cost as internal estimate.
- **`lib/ops/discord.ts`:** Discord lines renamed to **Billable LLM calls** with `$X.XX est.` formatting.
- **`lib/ai/log-usage.ts`:** Insert fallback omits migration-058 scanner columns when DB has not applied `058_ai_usage_scanner_metadata.sql` (restores `source`, `source_page`, `request_kind`, `pricing_version` on rows).
- **`app/api/chat/stream/route.ts`:** Requests `stream_options.include_usage` and logs **actual OpenAI usage tokens** when present (falls back to char/4 only when usage chunk missing).

### Website — chat thread isolation (cross-thread deck / history leak)

- **`resolve-thread-deck-id.ts`:** Thread `deck_id` wins over client `context.deckId` when they conflict (fixes AI using the previous thread’s deck after a fast thread switch).
- **`app/api/chat/stream/route.ts`**, **`app/api/chat/route.ts`:** Use shared resolver; log when client deck id is rejected.
- **`components/Chat.tsx`:** On thread switch, clear messages and linked deck immediately, abort in-flight stream; logged-in users with a thread no longer send `context.deckId` or client `messages[]` (server loads from `chat_messages` per `thread_id`).
- **Tests:** `tests/unit/resolve-thread-deck-id.test.ts`.

### Scanner AI API (mobile)

- **Pro scanner AI:** No daily durable cap on `scan-disambiguate` / `recognize-image` (guest/free limits unchanged; global budget gate remains).
- **Fuzzy preference:** When validation returns a short prefix of a client fuzzy candidate, use the full fuzzy name (e.g. Rakka Mar → Rakka Mar, Steamkin Renegade).
- **Phase A reliability:** `response_format: json_object`; snap AI pick to fuzzy list; fuzzy-list fallback when validation fails; `code` on hard failure (`parse_failed` / `validation_failed`).
- **`POST /api/cards/scan-disambiguate`:** Text-only OpenAI disambiguation among OCR/fuzzy candidates (Phase A stealth).
- **`POST /api/cards/recognize-image`:** `assistMode` (fallback|improve), `imageRole` (title|full); shared validation via `lib/scanner/scan-ai-core.ts`.
- **Models:** `lib/scanner/scan-ai-models.ts` → `getModelForTier` (no `MODEL_SCAN_*` env); upgrade via `default-models.ts` / `MODEL_GUEST` / `MODEL_FREE` / `MODEL_PRO_*`.
- **Docs:** `docs/SCANNER_AI_API.md`. **Limits:** `SCAN_DISAMBIGUATE_*` in `feature-limits.ts`.

### Website — manual deck builder from collection

- **`BuildDeckFromCollectionChooser`:** Two-step entry — **Build it myself** vs **Build it with AI** (sparkle on AI only); primary collection CTA no longer shows sparkle.
- **`/collections/[id]/build/manual`:** Format picker → Commander commander-picker (owned eligible only, art rows) → tabbed browser (Lands / Creatures / Spells / Other), sort, live search, lazy list, Add with in-deck counts; save via `POST /api/decks/create` (any count under 200-card cap).
- **`lib/build/`:** `collectionCardBucket`, `collectionManualDeckDraft`, `sortCollectionCards`, `useCollectionBuildMetadata`.
- **Files:** `components/manual-build/*`, `components/BuildDeckFromCollectionPanel.tsx`, `components/BuildDeckFromCollectionChooser.tsx`.

### Website — collection build + playstyle quiz flow

- **`BuildDeckFromCollectionModal`:** Sends `quiz_build`, `collectionOwnershipMode`, and full quiz playstyle string; tab order Guided → **Find My Playstyle** → Quick; ownership mode selector; guided link to quiz; session handoff from quiz results.
- **`lib/build/collectionPlaystylePayload.ts`:** Shared API body builder + session handoff for `/collections/[id]?buildDeck=1&buildTab=quiz`.
- **`BuildDeckFromCollectionPanel`:** “Start with playstyle quiz” CTA; opens modal from URL params.
- **`PlaystyleQuizResults`:** Optional `collectionId` + “Build from my collection” when generating from a collection context.

### Commander collection builds — land cap, land-heavy rebalance, quiz playstyle prompts

- **`collection-commander-generation.ts`:** Cap owned basics to collection qty; target **37** lands / max **40**; `enforceCommanderCollectionManaBase` + `rebalanceLandHeavyMostlyCollectionDeck` when mostly_collection is **≥75% owned** but **>45%** lands; `deckUniqueNameJaccardPercent` helper.
- **`generate-from-collection/route.ts`:** Runs mana-base enforcement and land-heavy rebalance after legality (fixes `quiz_build` basic stuffing).
- **`generation-input.ts`:** Stronger `quiz_build` + **PLAYSTYLE DIVERGENCE** directives (15+ nonland swaps, archetype-specific bans).
- **Tests:** `collection-commander-generation.test.ts`, `playstyle-prompt-divergence.test.ts`; matrix smoke asserts land ≤40 and opposed playstyle Jaccard <50%.

### Commander generate-from-collection — guide + precon hints

- **`lib/deck/commander-generation-context.ts`:** Appends curated commander profile (plan, tags, coach notes, flagship traps) plus official **precon** land/ramp/draw/removal targets from `precon_decks` to the generation user prompt.
- **`lib/commanders.ts`:** `getCommanderProfileByName` for name lookup.
- **`app/api/deck/generate-from-collection/route.ts`:** Injects reference block for Commander requests.
- **Tests:** `tests/unit/commander-generation-context.test.ts`.

### Commander generate-from-collection — mostly-owned tuning

- **`mostly_collection`:** Stronger prompt (≥75% owned slots, ≤25 off-collection); mana base prefers **owned basics** before generic padding; **`rebalanceMostlyCollectionDeck`** swaps off-collection slots for owned cards when the model under-delivers.
- **`collectionFit`:** `missingUniqueCount`, `missingNamesTruncated`, `ownershipNote`, `rebalanceSwaps`; missing name cap raised to 40.
- **Tests:** Rebalance coverage in `collection-commander-generation.test.ts`.

### Commander generate-from-collection — collection sampling + ownership

- **`lib/deck/collection-commander-generation.ts`:** `collectionOwnershipMode` parsing (legacy `buildMode` ownership tokens still accepted), prompt directives, `collection_only` off-collection filter, owned-basic-only padding to 100, `COLLECTION_NEEDS_LANDS` error, `collectionFit` summary.
- **`app/api/deck/generate-from-collection/route.ts`:** Uses `preparePromptCardSample` for large collections; structured ownership post-processing; returns `collectionFit` in preview JSON.
- **`lib/deck/generation-input.ts`:** `collectionOwnershipMode` on normalized input; collection size note in user prompt.
- **Tests:** `tests/unit/collection-commander-generation.test.ts` (wired in `test:unit`).

## 2026-05-27

### Mobile Command Center — tiered Discord alert policy

- **`lib/admin/mobile-command-center.ts`:** Removed `daily_ops_report` from pipeline monitoring (fixes self-referential 4/5 healthy loop). Split jobs into Tier-1 hourly (`bulk_price_import`, `price_snapshot_bulk`, `deck-costs`), daily digest Discover jobs, and weekly jobs (`bulk_scryfall`, `mtg-legality-refresh`, `budget-swaps-update`). Hourly Discord now filters through `shouldSendHourlyDiscordAlert` (Tier-1 + critical Sentry/errors only).
- **`lib/ops/run-ops-report.ts`:** Daily digest uses `shouldCountForDailyDigestStatus`, includes pipeline/Discover freshness, and weekly digest reports weekly job staleness.
- **`lib/ops/discord.ts`:** Daily Discord message adds pipeline + Discover job lines; weekly message lists weekly pipeline jobs.
- **`lib/ops/run-ops-report.ts` + `discord.ts`:** Daily digest splits signups — mobile app signups from PostHog (`platform=app` / React Native), website signups from PostHog web attribution, plus shared **New profiles (all platforms)** from Supabase.
- **`lib/admin/adminJobDetail.ts`:** Added `jobLastSuccessConfigKey`, legality/meta stale windows.
- **Docs:** `MOBILE_ADMIN_CONTROL.md`, `CRONS.md`.

## 2026-05-08

### Blog — three new Commander articles

- **`lib/blog-defaults.ts`:** Added `roast-my-deck-funniest-deckbuilding-fails`, `commander-land-count-guide`, `commander-deckbuilding-mistakes` (May 2026) to `DEFAULT_BLOG_POSTS`.
- **`app/blog/[slug]/page.tsx`:** Full `blogContent` for each slug; metadata title strips additional emoji for SEO (`⚠️🔥🌍`).
- **`db/migrations/109_blog_may_2026_three_posts.sql`:** Optional Supabase `app_config.blog` listing metadata — apply manually if API should mirror cards.

## 2026-05-07

### Security — lock down SECURITY DEFINER RPCs and ai_eval_* tables

- **`db/migrations/105_revoke_public_exec_security_definer_rpcs.sql`:** `REVOKE` execute on `vacuum_analyze_table`, `migrate_cache_schema`, `cleanup_old_rate_limits`, `get_user_id_by_email`, `admin_search_auth_users` from `PUBLIC` / `anon` / `authenticated`; `GRANT EXECUTE` to `service_role`. Optional block for `handle_new_user` (if present): revoke from clients, grant to `service_role` and `supabase_auth_admin` so auth triggers keep working. **Apply on Supabase** — website callers already use **`getAdmin()` / service role** (including Stripe webhook).
- **`db/migrations/106_lockdown_ai_eval_tables.sql`:** `ai_eval_sets` / `ai_eval_set_runs` — service-role-only RLS + table `REVOKE` from `anon`/`authenticated` (unused in app code; `eval_runs` admin API unchanged).

### Security — staged: seo_pages RLS + security invoker views

- **`db/migrations/107_seo_pages_enable_rls.sql` (apply first):** `ENABLE ROW LEVEL SECURITY` on `seo_pages`; `anon`/`authenticated` **SELECT** only where `status = 'published'` (matches `lib/seo-pages.ts` static/anon reads). **Service role bypasses RLS** for admin routes.
- **`db/migrations/108_security_invoker_views_persona_collection.sql` (apply after smoke-testing 107):** set `security_invoker = true` on `ai_persona_usage_30d`, `ai_persona_usage_daily`, `collection_public_lookup`, `collection_card_enriched` when each view exists. If anything still queried these as anon and relied on elevated access, validate those calls before applying.

### Security — AI auto-improve tables, analytics, public deck browse

- **`db/migrations/104_lockdown_ai_auto_improve_tables.sql`:** Tighten RLS on `ai_prompt_candidates`, `ai_improvement_reports`, `ai_prompt_history` to **service_role only**; `REVOKE` from `anon`/`authenticated`; `GRANT ALL` to `service_role`. **Apply on Supabase** for production. No admin UI in this repo referenced these tables (engine was DB-only / unused in app code).
- **`app/api/analytics/track-event`:** `user_id` is taken **only** from verified session (cookies or Bearer). Body / `properties.user_id` are ignored (anti-spoofing).
- **`app/api/decks/browse`:** Returns **503** if service role key or public Supabase URL is missing (no anon-key fallback).

### Security — remove chat debug API

- Removed unused **`/api/chat/debug/*`** routes (env/auth/echo/llm/etc.) to reduce information disclosure in production.
- **`tests/chat.smoke.spec.ts`:** Preflight check now uses **`GET /api/mobile/bootstrap`** instead of the removed echo endpoint.

## 2026-04-28

### Constructed AI generation stability

- Added post-filter repair for near-complete 60-card lists.
- Tightened retry conditions and prompts.
- Improved explanation hygiene after validation.

### Constructed AI template seeding

- Added validated seed templates/guidance for constructed deck generation.
- Improved Pioneer and Standard reliability without changing Commander routes.
- Kept response contract unchanged.

### Constructed AI — Standard-only resilience

- **`lib/deck/generate-constructed-standard.ts`:** Standard-wide mainboard padding (**45–59** cards); optional **Azorius Control** validated fallback shell (mostly basics) when AI/repair/padding cannot produce 60; stronger server logs for Standard failure stages (**parse**, **main_below_45**, **padding_failed**, **fallback_unavailable**, etc.).
- **`app/api/deck/generate-constructed/route.ts`:** Branches **Standard** vs other formats so **Modern/Pioneer/Pauper** keep prior padding floors; Standard attempts fallback before **502** only for **Standard + W/U + Control** body shape.
- Response JSON keys unchanged; fallback adds the documented warning string when used.

### Constructed AI color identity fix

- Prevent off-color cards in generated decks based on selected colors (`color_identity` ⊆ request colors via **`getDetailsForNamesCached`**); optional **one** regeneration when **>30%** of quantity would be dropped.

### POST `/api/deck/generate-constructed` — competitive 60-card AI deck builder

- **`app/api/deck/generate-constructed/route.ts`:** New authenticated + guest-friendly route (rate limits: **`GENERATE_CONSTRUCTED_*`** in **`lib/feature-limits.ts`**). Validates body with **zod**; calls OpenAI **`response_format: json_object`**; parses **`mainboard` / `sideboard`** lines; **`filterDecklistQtyRowsForFormat`** drops illegal cards with optional **retry** prompt; **`price_cache`** USD estimate (best-effort); **`recordAiUsage`** route **`deck_generate_constructed`**; **`getModelForTier`** **`deck_analysis`**. Does **not** modify Commander **`generate-from-collection`**.
- **`lib/prompts/generate-constructed.ts`:** Tournament Magic prompts (curve, interaction, sideboard, no Commander framing).

## 2026-04-27

### Format-aware tools — Phases 2–6 (no `Mixed` API enum)

- **`lib/format/manatap-deck-format.ts`:** Shared **`MANATAP_DECK_FORMAT_KEYS`**, **`normalizeManatapDeckFormatKey`** (default **commander**), **`isCommanderFormatKey`**, **`formatKeyToDisplayTitle`**.
- **`POST /api/deck/swap-why`:** Optional **`format`** / **`deckFormat`**, **`commander`** / **`commanderName`**; prompts branch Commander vs 60-card; response shape unchanged.
- **`app/deck/swap-suggestions/Client.tsx`:** Passes **`format`** / **`commander`** into swap APIs when present from Supabase.
- **`lib/mulligan/advice-handler.ts`:** Stronger Commander vs 60-card system/user prompts (London mulligan wording for 60-card); output JSON unchanged.
- **`tests/unit/mulligan-advice-format.test.ts`**, **`package.json`:** **`test:unit`** includes mulligan format coverage.
- **`lib/mobile/deck-compare-mobile-prompt.ts`:** Extra “constructed lens” paragraph for non-Commander compare **`formatLabel`** (mobile still avoids sending **`Mixed`** to the API; Commander default when mixed).
- **`lib/mobile/roast-ai-prompt.ts`**, **`lib/prompts/deck-roast.ts`:** Roast prompts branch Commander vs 60-card (commander line + lens); website uses same normalizer as mobile.
- **`POST /api/playstyle/explain`:** Optional **`format`** (default Commander); **cache key** includes normalized format; OpenAI + **fallback** prompts branch; response **`{ paragraph, becauseBullets }`** unchanged.
- **`PlaystyleQuizResults` / `PlaystyleQuizModal`:** Optional **`explainFormat`** → request **`format`** when set (omitted = Commander server default).

### Deck Compare mobile prompt — format-aware wording (Phase 1)

- **`lib/mobile/deck-compare-mobile-prompt.ts`:** System line is Commander-specific only for Commander; other formats use “deck analyst for {format}”. User-prompt rules clarify **faster vs grindier games** for 60-card formats while keeping the **same JSON keys** and **`[[Card]]`** rule.

### Mulligan advice API — optional format (Phase 1)

- **`POST /api/mulligan/advice`** and **admin** `POST /api/admin/mulligan/advice`:** Optional **`format`** enum **`commander` | `modern` | `pioneer` | `standard` | `pauper`** (default **commander**). Request body **`format`** is passed through to **`runMulliganAdvice`** instead of always forcing Commander.
- **`lib/mulligan/advice-handler.ts`:** Commander keeps the existing coach prompt; supported 60-card formats use a dedicated opening-hand coach prompt. **Output JSON** unchanged; cache key includes format.

## 2026-04-21

### Mobile Deck Roast — punchiness & share_line pass

- **`lib/mobile/roast-ai-prompt.ts`:** Strongest issues only (max 3, prefer 2); strict two-sentence issue bodies (joke + proof); share_line as top screenshot quote (~110 chars); sniper callouts; final = two punchy lines; spicy = surgical/terse; **`MOBILE_ROAST_AI_PROMPT_VERSION` → `2026-04-21.v1`**.
- **`lib/mobile/roast-ai-response.ts`:** Tighter caps (share 110, issues, callouts, final 240, opening 180).
- **`app/api/mobile/deck/roast-ai/route.ts`:** **`maxTokens` 1150**.

## 2026-04-20

### Mobile Deck Roast — less redundancy, clearer field roles

- **`lib/mobile/roast-ai-prompt.ts`:** Split **verdict_summary** (at-a-glance structural read) vs **opening_jab** (main roast) vs **share_line** (compact screenshot hook); ban cross-field joke recycling; lighter stat lecturing; tighter issues/callouts/final; **`MOBILE_ROAST_AI_PROMPT_VERSION` → `2026-04-20.v1`**.
- **`lib/mobile/roast-ai-response.ts`:** Shorter caps; **no** fallback that copies opening into verdict; **share_line** dedup vs glance + opener with callout/generic last resort; **`maxTokens`** on route **1280**.

## 2026-04-19

### Mobile Deck Roast — punchier prompts + deck signals

- **`lib/mobile/roast-ai-prompt.ts`:** Tighter mobile roast (~30% shorter target), stronger mild/medium/spicy differentiation, ban repetitive “it’s like X” structures, require screenshot-worthy `share_line`, stronger final verdict closer, server-chosen comedy-angle variety.
- **`lib/roast/roast-deck-signals.ts`:** Name-heuristic land / ramp / wipe / draw / finisher / greedy mana counts injected into the prompt; model cross-checks against the list.
- **`lib/mobile/roast-ai-response.ts`:** Shorter field caps; `share_line` deduped from `verdict_summary` when identical.
- **`app/api/mobile/deck/roast-ai/route.ts`:** Wires signals + variety; `heat` case-insensitive; `maxTokens` 1536.
- **`MOBILE_ROAST_AI_PROMPT_VERSION`:** `2026-04-19.v1`.

## 2026-04-18

### Mobile Deck Roast v2 (structured JSON)

- **`POST /api/mobile/deck/roast-ai`:** New route — JSON roast tuned for ManaTap (`heat` mild/medium/spicy, section fields, `share_line`, `prompt_version`). Does **not** change **`POST /api/deck/roast`** or **`lib/prompts/deck-roast.ts`**.
- **`lib/roast/deck-roast-prep.ts`:** Parse + parse-and-fix-names fetch (same behavior as website roast; website route not refactored yet).
- **`lib/mobile/roast-ai-prompt.ts`**, **`roast-ai-response.ts`**, **`roast-ai-types.ts`:** Prompt + zod normalization + optional bracket-token strip.
- **`ai_usage`:** Feature **`deck_roast_mobile`**; timeout + **`call-origin-map`** / **`route-to-page`** / unit test list updated.

### Docs

- **`../docs/MOBILE_ROAST_V2.md`:** Architecture, contract, migration notes.

## 2026-04-17

### `ai_usage` write path — use service-role client (RLS fix)

- **`lib/ai/log-usage.ts`:** **`recordAiUsage`** now uses **`getAdmin()`** (service role) instead of **`getServerSupabase()`** (cookie/anon). **`ai_usage`** has RLS policy **`auth.uid() = user_id`** (USING + WITH CHECK), so the anon cookie client was silently dropping every insert where `auth.uid()` didn't equal `user_id`:
  - **Mobile app** (`Authorization: Bearer …`, no cookies) → cookie client sees no JWT → `auth.uid()` NULL → WITH CHECK fails → insert blocked.
  - **Guests** (no auth) → same, blocked.
  - **Website signed-in** worked only because cookies carried the matching JWT (46 596 rows all had `has_user=true`, zero with `user_id IS NULL`).
- Falls back to the cookie client if `SUPABASE_SERVICE_ROLE_KEY` is missing, so the logger never throws.
- Also promoted final-fallback and catch-path **`console.warn`** out of `DEV`-only so silent production drops are visible in Vercel logs.

### Mobile AI usage attribution (`ai_usage` / admin ai-usage-app)

- **`app/api/mobile/deck/analyze/route.ts`:** Read JSON **once** and pass **`parsedBody`** into **`runDeckAnalyzeCore`**. A second **`req.json()`** after **`req.clone().json()`** could yield an empty body, dropping **`usageSource` / `sourcePage`** so **`source`/`source_page`** never showed as app-tagged.
- **`app/api/deck/analyze/route.ts`:** **`runDeckAnalyzeCore`** accepts optional **`parsedBody`**; accept **`source_page`** as alias for **`sourcePage`**.
- **`app/api/mulligan/advice/route.ts`:** Map **`source_page` → `sourcePage`** before Zod parse so `app_mulligan_advice` is not lost.

## 2026-04-14

### Mobile auth — precon clone import

- **`app/api/decks/precons/import/route.ts`:** After cookie **`getUser()`**, accept **`Authorization: Bearer`** and use **`createClientWithBearerToken`** so the Expo app can clone precons without browser cookies (same pattern as **`/api/deck/analyze`**).

## 2026-04-05

### Phase 3 — price series: safer `price_snapshots` prefix fallback

- **`app/api/price/series/route.ts`:** After exact **`name_norm`** miss, **`ilike(firstWord%)`** is used only when all returned rows share **one** distinct **`name_norm`** (otherwise skip — avoids wrong-card history).

### Phase 1 — price series: `price_snapshots.name_norm` matches snapshot writer

- **`app/api/price/series/route.ts`:** Primary `.in('name_norm', …)` uses **`scryfallCacheLookupNameKeys`** (same **`normalizeScryfallCacheName`** as **`priceSnapshotFromScryfallBulk`**), not the previous inline NFKD+apostrophe norm. Scryfall fallback keys card rows with **`normalizeScryfallCacheName(c.name)`**.
- **`lib/server/scryfallCacheRow.ts`:** JSDoc — **`price_snapshots.name_norm`** + mobile **`nameNormForSnapshots`** lockstep note; contrast with **`price_cache`**.
- **`lib/server/priceSnapshotFromScryfallBulk.ts`:** Comment — readers must use writer normalization.

### Phase 3B — collection bulk CSV upload: safe resolved names

- **`lib/collections/buildResolvedCollectionBulkNameMap.ts`:** Batched same-origin **`POST /api/cards/fuzzy`**; maps sanitized keys → persistence names, applying **`suggestion` only when `all.length === 1`** (no silent pick among multiple fuzzy candidates).
- **`app/api/collections/upload-csv/route.ts`:** Uses the map so **`collection_cards.name`** matches resolved titles when unambiguous; merge/lookup keyed on resolved name.
- **`app/api/collections/upload/route.ts`:** Full replace upload resolves names the same way before chunked insert.

### Phase 3 — wishlist batch add: persisted name alignment

- **`app/api/wishlists/add/route.ts`:** Sanitize with **`sanitizedNameForDeckPersistence`**, then optional batched **`POST /api/cards/fuzzy`** (same pattern as **`decks/cards`** / **`collections/cards`**) so **`wishlist_items.name`** matches resolved titles when the API suggests a different spelling; **`skipValidation`** preserves prior behavior; auth metadata mirror uses the same persisted string.

### Entry-point name recovery (search + scan recognize)

- **`app/api/cards/search/route.ts`:** After Scryfall autocomplete and **`cards/search`** both return no rows, **one-shot `cards/named?fuzzy`** (skipped when the query looks like Scryfall syntax, e.g. contains `:` / `=` / `!`) so typos still surface a single best title for **`CardAutocomplete`** / **`EditorAddBar`**.
- **`app/api/cards/recognize-image/route.ts`:** After fast **`scryfall_cache`** checks, call same-origin **`POST /api/cards/fuzzy`** before Scryfall named fuzzy so vision guesses reuse the full cache + autocomplete + fuzzy pipeline; response shape unchanged.

### Entry-point fuzzy — verification (cache-first)

- **`app/api/cards/search/route.ts`:** Tier-3 fuzzy suggestion is still only **`{ name }`**; it is **accepted only if `scryfall_cache` has that exact `name`**, so the typeahead does not promote Scryfall-only oracle titles with no cached row.
- **`app/api/cards/recognize-image/route.ts`:** Documented that **`validated_name` / alternatives are title strings**, not cache-backed card payloads; clients still resolve art/prices via their own lookups.

### Phase 2 — card-data cleanup (low-risk)

- **`lib/server/scryfallCacheRow.ts`:** **`scryfallCacheLookupNameKeys(raw)`** — shared **`scryfall_cache.name`** lookup candidates (not **`price_cache`**); used by **`lib/ai/error-recovery.ts`**, collection MTGO **`export`**, **`popular-cards`**.
- **`lib/ai/error-recovery.ts`:** **`fallbackToScryfallCache`** — empty candidate guard + helper.
- **`app/api/collections/cost/route.ts`:** Owned-cards table probe order — **`collection_cards` first**, then legacy names.
- **`app/api/admin/decks/bulk-import/route.ts`:** Sideboard inserts match live **`deck_cards`** shape (**no `is_sideboard`** column in repo migrations).

### API / cache key shaping (Phase 1B)

- **Recommendations:** `app/api/recommendations/cards/route.ts` and `app/api/recommendations/deck/[id]/route.ts` — image rows use **`normalizeScryfallCacheName`** / **`cacheNameNorm`**; **`price_cache`** uses **`normalizeName`** (`@/lib/mtg/normalize`); **`.maybeSingle()`** instead of `.single()` on lookups.
- **Collection MTGO export:** `app/api/collections/[id]/export/route.ts` — **`scryfall_cache`** enrich query uses PK candidates from **`normalizeScryfallCacheName` + `cleanCardName`**, remap by row **`name`**.
- **Chat fallback:** `lib/ai/error-recovery.ts` — **`fallbackToScryfallCache`** queries with PK candidate **`.in('name', …)`**.
- **Popular cards:** `app/api/deck/popular-cards/route.ts` — commander **`color_identity`** via **`normalizeScryfallCacheName` + `cleanCardName`** **`.in('name', …)`**.

### Card pages — `printed_name` (display only)

- **`lib/cards/displayName.ts`:** **`getDisplayCardName`** — prefer cache **`printed_name`** when it differs from oracle **`name`** (UI only).
- **`lib/server/scryfallCache.ts`:** **`getDetailsForNamesCached`** selects **`printed_name`** from **`scryfall_cache`** and passes it through on live-fetch merges.
- **`app/cards/[slug]/page.tsx`:** Top card page — **breadcrumb** last segment uses **oracle** name (navigation/identity); **h1** uses **`getDisplayCardName`** (printed when distinct); **img alt** is **`Printed (Oracle)`** when they differ so screen readers keep canonical identity; optional muted **Oracle:** line when printed differs.

## 2026-04-04

### Deck generation — refinement `more_card_draw`

- **`lib/deck/generation-input.ts`:** **`refinementPromptDirective`** maps **`more_card_draw`** (aligned with ManaTap preview “light draw” signal). **`refinementPromptDirectivesJoined`** applies **comma-separated** refinement tokens (e.g. **`more_card_draw,more_ramp`**) as separate prompt blocks instead of one unknown token.

## 2026-04-03

### AI deck generation — `parseAiDeckOutputLines` + generate-from-collection

- **`lib/deck/generation-helpers.ts`:** Parser accepts **numbered lists**, **markdown fences**, **`- ` bullets**, **bare card-name lines** (no quantity), **\`** / **\`** stripping.
- **`app/api/deck/generate-from-collection/route.ts`:** **`max_completion_tokens` 16384**; **`extractChatCompletionContent`** so gpt-5-style **array `message.content`** is not read as empty (fixes **0 cards** + false **length** failures). **Up to 4 continuation** chat rounds when **`finish_reason === "length"`** and Commander deck still **under 95** total qty. On **too short** decklists logs **`finish_reason`**, parse stats, and a **content head**; app sees an extra sentence when **`finish_reason === "length"`**. **Commander:** validate **total card count** (**`totalDeckQty`**); **cap at 100** with **`trimDeckToMaxQty`**; **≥95** total before CI filter; **one completion retry** when **40–94** cards and not **`length`**; **skip color-identity filter** when commander colors are **unknown**; CI **over-prune fallback** by **total qty**; **reject** final Commander lists with **fewer than 90** total cards.
- **`lib/deck/generation-helpers.ts`:** **`extractChatCompletionContent`**, **`totalDeckQty`**, **`trimDeckToMaxQty`**.
- **`lib/deck/generation-input.ts`:** System prompt — **start with first deck line immediately**; **group basics** to reduce truncation.
- **Tests:** `tests/unit/parse-ai-deck-output-lines.test.ts` (in **`npm run test:unit`**).

## 2026-04-01

### Documentation — Supabase grant hardening (shared project)

- **`docs/SUPABASE_SCHEMA.md`:** New subsection **Database access — grant hardening** documenting production privilege changes on `ops_reports`, `seo_queries`, `deck_costs`, `seo_pages`, and tables intentionally deferred (`ai_test_*`, `api_usage_rate_limits`).
- **`docs/CURSOR_AGENT_HANDOVER.md`:** Database section updated to reference grant tightening vs RLS-only wording.

*Note: Privilege changes were applied in Supabase (not via this repo’s migration files in this pass).*

### Documentation — full `public` schema snapshot

- **`docs/SUPABASE_SCHEMA.md`:** Embedded `CREATE TABLE` list refreshed from a Supabase export (adds e.g. `app_changelog`, `remote_config`, expanded `ai_test_*` / `scryfall_cache` columns, `*_backup_20260328` staging tables). Short **Export note** clarifies `watchlists` vs `wishlists` and duplicate `wishlists` lines in some exports.

## 2026-03-31

### Admin — mobile scanner analytics (PostHog)

- **`/admin/app-scanner`:** Dashboard for mobile scanner events (`scan_card_*`, `scan_ai_*`): overview tiles, funnel-style counts, quality breakdowns (name resolution, match source, confirm method), AI Assist blocked/fallback/failures, auto-add vs canonical rates, and `will_persist_to_supabase` (new-deck vs persisted intent).
- **`GET /api/admin/scanner-analytics/overview`:** Server HogQL aggregates; uses `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID` when set.
- **`lib/server/posthog-hogql.ts`:** Minimal HogQL client for admin reporting.
- **Nav:** Link under Admin → Mobile & Client Control (`JustForDavy`).
- **Docs:** `docs/ADMIN_SCANNER_DASHBOARD.md` (purpose + **REVERT** steps); `docs/MOBILE_ADMIN_CONTROL.md` table row for `/admin/app-scanner`.

### Cache key alignment (scryfall PK vs price key)

- **`app/api/deck/shopping-list/route.ts`:** `getCachedCardData` queries **`scryfall_cache.name`** with **`normalizeScryfallCacheName`** (not the price-style `normalizeName`). **`price_cache`** paths unchanged.
- **`lib/deck/deck-context-summary.ts`:** Fallback **`tally()`** looks up **`fetchCardsBatch`** rows with **`normalizeScryfallCacheName(name)`** instead of **`toLowerCase()`**. Deck hash / **`normalizeCardName`** hashing unchanged.

## 2026-03-30

### Deck editor — Maybe / Flex cards (non-Commander only)

- **Storage:** Optional **`decks.meta.maybeFlexCards`**: `Array<{ name: string; qty: number }>` (not in **`deck_cards`**). No migration; absent field loads as empty.
- **UI:** **`app/my-decks/[id]/CardsPane.tsx`** — collapsible **Maybe / Flex cards** section (helper copy) when format is set and not Commander; **`Main deck ·`** prefix on main card count. Add/remove/qty via **`EditorAddBar`** + row controls; **POST `/api/decks/maybe-flex`** persists (owner auth; **400** for Commander).
- **Helpers:** **`lib/deck/maybeFlexCards.ts`** — **`isMaybeFlexBucketEnabledForFormat`** (false if format missing/empty or Commander), normalize/merge helpers.
- **Analysis:** Unchanged — **DeckAnalyzerPanel** / **`/api/deck/analyze`** build **`deckText`** from **`deck_cards`** only; maybe/flex never included.
- **Follow-up (gating):** **`isMaybeFlexBucketEnabledForFormat`** / **`POST /api/decks/maybe-flex`** share the same gate: disabled for **empty format**, **`commander`**, **`edh`**, **`cedh`** (case-insensitive). Fixes mismatch where API could accept saves when the UI hid the section (e.g. unset format); **`edh`** / **`cedh`** labels now match Commander.
- **Polish:** **`Maybe / Flex: N cards`** qty total in **`CardsPane`** totals row (eligible decks). **Public** **`/decks/[id]`** — read-only **Maybe / Flex** block in **`PublicDeckCardList`** when meta has entries. **Copy decklist** + **Export CSV** append **`// Maybe / Flex cards`** via **`buildMaybeFlexPlaintextAppend`** (`lib/deck/maybeFlexCards.ts`).

### Collection page — card deck usage (badges, filter, detail)

- **Deck usage map:** Single GET **`/api/collections/deck-usage`** loads the signed-in user’s decks + **`deck_cards`**, aggregates to **`usageByKey`** (normalized keys, MDFC front-face fallback). Unsigned users get empty data (fail-open). **`lib/collection/deckCardUsage.ts`** holds **`getCardUsageKey`**, **`getDeckUsageForCard`**, and server aggregation helper.
- **`components/CollectionEditor.tsx` (page mode):** Row pill shows **deck count** when the card appears in ≥1 deck; **⋯** opens a detail modal. **Deck use** filter: All / In decks / Unused (enabled after usage load). Scryfall link + list behavior unchanged.
- **`components/CollectionCardDetailModal.tsx`:** Full-art modal with **In your decks** (**`<details>`**, collapsed by default); deck rows link to **`/my-decks/[id]`** with quantity.

### Collection deck usage — QA hardening (2026-03-30)

- **`lib/collection/deckCardUsage.ts`:** Unicode curly quotes folded before **`normalizeCardName`** for stabler name matching.
- **`app/api/collections/deck-usage/route.ts`:** **`deck_cards`** query uses **`.order('id')`** so **`.range`** pagination is deterministic.
- **`CollectionEditor.tsx`:** Clear usage map when refetching; **`deckUsageTrustworthy`** gates badges/filters/modal usages when **`loadError`** is set; refetch on **`authUser?.id`** change; reset modal/filter on session/collection change; **`loadHint`** on non-OK HTTP and fetch **catch** so **Unused** is not trusted without a valid response body.
- **`CollectionCardDetailModal.tsx`:** Optional **`detailsResetKey`**; **`Link`** **`onClose`** before navigate.

## 2026-03-28

### Meta cron — trending cards (trend delta, filters)

- **`app/api/cron/meta-signals/route.ts`:** **`trending-cards`** now uses **unique deck incidence** (not row counts), **trend_score = (recent_count/recent_total) − (prev_count/prev_total)** (recent = last 30d activity; previous = 30–60d ago via `created_at` and `updated_at` sub-windows, deduped). Excludes **`scryfall_cache`** lands (`is_land` or **`type_line`** word **`Land`** via `\bLand\b` — not substring `land`, which wrongly matched **Island**), **staple denylist**, cards in **>40%** of a **1000-deck** sample, and **<5** recent decks. Still **30** rows. **most-played-cards** unchanged.
- **`lib/meta/trendingCardsCompute.ts`:** Pure scoring + constants; **`isLandFromCacheRow`** fix (above).
- **`tests/unit/trending-cards-compute.test.ts`:** Assert-style unit checks.

### Vercel cost — polling, middleware, ingest matcher

- **`lib/active-users-context.tsx`:** **`/api/stats/activity`** poll **120s** (was 60s); **no poll while tab hidden**; **visibility** refetch when stale (~90s); **in-flight** dedupe.
- **`components/RateLimitIndicator.tsx`:** Pro **`/api/rate-limit/status`** poll **120s** (was 30s); same **visibility** + **dedupe**; **`hasWarned`** moved to **ref** so toasts don’t reset the interval.
- **`middleware.ts`:** After a **maintenance off** config read, **skip** internal **`/api/config?key=maintenance`** fetch for **12s** (emergency: **`MAINTENANCE_HARD_READONLY`**); matcher excludes **`/ingest/*`** (analytics proxy — no session/maintenance work).

### Deck role tagging — supplemental Scryfall `keywords`

- **`lib/deck/card-role-tags.ts`:** After existing oracle/heuristic rules, optional additive tags from `EnrichedCard.keywords` (source `keywords`, lower confidence): Landfall → `payoff` (nonlands only); subset of graveyard keyword actions → `graveyard_setup`; Populate → `token_payoff`; Fabricate → `token_producer`. Skipped when that role was already assigned.
- **`tests/unit/card-role-tags-keyword.test.ts`:** Covers the new additive paths only.
- **`docs/IMPLEMENTATION_REFERENCE.md`:** Short note on primary vs keyword-supplemental tagging.

### Docs / guardrails — cache keys vs price keys vs display names

- **`docs/IMPLEMENTATION_REFERENCE.md`:** Short table: scryfall PK (`normalizeScryfallCacheName`), `price_cache` key (`/api/price`), `canonicalize()` (display/alias).
- **Inline comments:** `lib/deck/inference.ts` (`norm`), `app/api/price/route.ts`, `lib/ai/price-utils.ts`, `lib/cards/canonicalize.ts` — clarify which normalizer applies where.
- **`tests/unit/cache-name-keys.test.ts`:** Asserts `normalizeScryfallCacheName` and price-route-style normalization diverge on U+2019 apostrophe (documented intentional difference).

### Deck inference — `byName` map key normalization

- **`lib/deck/inference.ts`:** All `byName` lookups and updates use the same canonical name helper as batch/card fetch (`normalizeScryfallCacheName` / `norm`) instead of `toLowerCase()`, so deck lines match cache keys (accents, Unicode normalization).
- **`tests/unit/inference-byName-key.test.ts`:** Asserts `tagCardRoles` resolves a deck line when the map is keyed by normalized name.

### Deck shopping list — `price_cache` schema alignment

- **`app/api/deck/shopping-list/route.ts`:** Reads/writes `price_cache` using `card_name`, `usd_price`, `eur_price`, and `onConflict: 'card_name'` (matches `app/api/price/route.ts` and bulk import). GBP for cached rows is derived from USD via the same FX pattern as the price route; no `gbp_price` column.
