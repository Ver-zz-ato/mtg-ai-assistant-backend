# ManaTap Website Routes, Workflows, and Pipelines Index

Purpose: quick map for future debugging, support work, and AI-assisted investigation.

Use this doc when you need to answer:

- Which API family owns this behavior?
- Which admin page should I open first?
- Which cron or webhook might be involved?
- Which doc should I read before digging into code?

---

## 1. High-value route families

### Mobile support and app-facing APIs

| Area | Main routes |
|---|---|
| Bootstrap/config | `/api/mobile/bootstrap` |
| Mobile AI tools | `/api/mobile/deck/analyze`, `/api/mobile/deck/compare-ai`, `/api/mobile/deck/compare-v2`, `/api/mobile/deck/compare-v2/ai`, `/api/mobile/deck/roast-ai`, `/api/mobile/card/explain`, `/api/mobile/commander-recommendations` |
| Mobile live play | `/api/mobile/live-games*`, `/api/mobile/tournaments*` |
| Scanner support | `/api/cards/fuzzy`, `/api/cards/recognize-image`, `/api/cards/batch-images`, `/api/cards/batch-metadata` |
| Mobile deck inputs | `/api/decks/import-url`, `/api/decks/precons` |
| Revenue / entitlements | `/api/revenuecat/webhook`, `/api/user/pro-status` |
| Website billing | `/api/billing/create-checkout-session`, `/api/billing/portal`, `/api/stripe/webhook` |
| Feedback/reporting | `/api/feedback`, `/api/chat/report` |
| Push / inbox | `/api/users/me/push-token`, `/api/users/me/inbox-comments` |

Deck Compare public route note: `/api/mobile/deck/compare-v2` backs the signed-in app Tools flow and the website `/compare-decks` page. It compares the user's saved decks, public ManaTap QR/shared-link decks, and pasted lists, then returns pod power / table-balance context. It must keep auth, saved-deck ownership checks, public-only scanned deck loading, input validation, request-size limits, and same-format enforcement. The deeper `/api/mobile/deck/compare-v2/ai` route remains Pro-only.

Live play route notes: `/api/mobile/live-games*` backs synced Life Counter QR/link sessions. `/api/mobile/tournaments*` backs Tournament Manager host/join events, invite tokens, deck submission snapshots, pairings, results, disputes, drops, and event completion. The website `/tools/tournament-manager` page is a browser UI over the same tournament route family, currently hidden in production except for `ADMIN_USER_IDS` / `ADMIN_EMAILS`; `/app/tournament` remains an invite compatibility handoff into the web manager when allowed or the mobile app otherwise.

Deck input route notes: `/api/decks/import-url` backs website and mobile public Moxfield/Archidekt link import. It accepts website cookie auth, mobile Bearer auth, or mobile `X-Guest-Session-Token`, then applies HTTPS-only URL validation, source host allowlists, timeout/response-size caps, and per-user/guest/IP rate limits before returning parsed `deckText`. `/api/decks/precons` is the shared public precon selector feed.

### Core product APIs

| Area | Main routes |
|---|---|
| Chat | `/api/chat/stream`, `/api/chat/threads/*`, `/api/chat/deck-actions/*` |
| Decks | `/api/decks/*`, `/api/deck/*` |
| Collections | `/api/collections/*` |
| Wishlists | `/api/wishlists/*` |
| Share/public | `/api/public-profile/[slug]`, `/api/share/comments`, `/api/analysis-report/share/*`, `/api/health-report/share/*` |
| Discover/meta | `/api/commanders`, `/api/commanders/[slug]/guide`, `/api/meta/trending`, `/api/decks/precons` |

### Admin and ops

| Area | Main routes |
|---|---|
| Mobile launch cockpit | `/api/admin/mobile-command-center/*` |
| Mobile config plane | `/api/admin/mobile/*` |
| Admin observability APIs | `/api/admin/audit`, `/api/admin/errors`, `/api/admin/rate-limits` |
| AI admin | `/api/admin/ai/*`, `/api/admin/ai-usage*`, `/api/admin/app-ai-feedback` |
| Revenue/admin billing | `/api/admin/stripe/*`, `/api/admin/entitlements/debug`, `/api/admin/monetize/*` |
| Data/admin jobs | `/api/admin/data/*`, `/api/admin/cron/run`, `/api/admin/ops-reports/*` |

---

## 2. Admin pages worth knowing

| Page | Why it matters |
|---|---|
| `/admin/JustForDavy` | Main jump-off page for admin tools |
| `/admin/mobile-command-center` | Launch control room for app health, analytics, revenue, errors, ops |
| `/admin/app-scanner` | PostHog scanner funnel and quality |
| `/admin/ai-usage-app` | Mobile app AI spend and recent requests |
| `/admin/remote-config` | Mobile remote config |
| `/admin/app-whats-new` | Mobile changelog content |
| `/admin/tier-limits` | Mobile tier limits JSON |
| `/admin/mobile-bootstrap-preview` | What the app bootstrap payload currently looks like |

If the app “feels weird” but not obviously broken, start with:

1. `/admin/mobile-command-center`
2. `/admin/mobile-bootstrap-preview`
3. `/admin/app-scanner` or `/admin/ai-usage-app` depending on symptom

---

## 3. Important workflows

### Mobile bootstrap control plane

Start here:

- `/api/mobile/bootstrap`
- `lib/mobile/bootstrap.ts`
- `app/api/mobile/bootstrap/route.ts`
- `docs/MOBILE_ADMIN_CONTROL.md`

Covers:

- feature flags
- remote config
- tier limits
- app changelog / What’s New

### Mobile launch monitoring

Start here:

- `/admin/mobile-command-center`
- `lib/admin/mobile-command-center.ts`
- `/api/admin/mobile-command-center/*`
- `docs/MOBILE_ADMIN_CONTROL.md`
- `docs/LAUNCH_DAY_RUNBOOK.md`

### Scanner analytics and OCR support

Start here:

- `/admin/app-scanner`
- `/api/admin/scanner-analytics/overview`
- `/api/cards/fuzzy`
- `/api/cards/recognize-image`
- `docs/ADMIN_SCANNER_DASHBOARD.md`

### Pro / payment / entitlement workflow

Start here:

- `/api/revenuecat/webhook`
- `/api/stripe/webhook`
- `/api/billing/create-checkout-session`
- `/api/user/pro-status`
- `/api/admin/entitlements/debug`
- `/api/admin/stripe/webhook-status`

Read next:

- `docs/POSTHOG_LAUNCH_DASHBOARDS_ELI5.md`
- `docs/LAUNCH_DAY_RUNBOOK.md`

### Feedback and issue reporting

Start here:

- `/api/feedback`
- `/api/chat/report`
- `/api/admin/app-ai-feedback`
- `docs/POSTHOG_FEEDBACK_DASHBOARDS_SPEC.md`

### Chat and deck action workflow

Start here:

- `/api/chat/stream`
- `/api/chat/threads/*`
- `/api/chat/deck-actions/{apply,cancel,undo}`

Read next:

- app repo `docs/CHAT_STREAM_MIGRATION_PHASES_1_9.md`

---

## 4. Cron jobs and background pipelines

Most important launch-adjacent jobs:

| Route | What it does |
|---|---|
| `/api/cron/mobile-command-center-rollups` | Refreshes launch rollups and sends deduped Discord alerts |
| `/api/cron/ops-report` + daily/weekly variants | Ops summary generation |
| `/api/cron/price/snapshot` | Price snapshot pipeline |
| `/api/cron/deck-costs` | Deck cost rollups |
| `/api/cron/commander-aggregates` | Commander/discover aggregates |
| `/api/cron/meta-signals` | Trending/most-played meta data |
| `/api/cron/budget-swaps-update` | Budget swaps support data |
| `/api/cron/update-banned-lists` | Rules/banned data refresh |
| `/api/cron/*scryfall*` and bulk jobs | Scryfall import/repair/prewarm pipelines |

Read first:

- `docs/CRONS.md`
- `docs/MOBILE_ADMIN_CONTROL.md`

---

## 5. Webhooks and external integrations

| Integration | Entry route | Notes |
|---|---|---|
| Stripe | `/api/stripe/webhook` | Billing/subscription events; Discord on checkout completion, first successful subscription invoice fallback, and subscription reactivation (`DISCORD_PRO_UPGRADE_WEBHOOK`, with admin/appsub/webhook URL fallbacks) |
| RevenueCat | `/api/revenuecat/webhook` | Mobile subscription/entitlement source of truth |
| PostHog | Query API via `lib/server/posthog-hogql.ts` | Used by admin scanner + mobile command center |
| Sentry | `lib/admin/mobile-command-center.ts` | Read-only issues API for launch cockpit |
| Discord | Mobile command center + Stripe webhook helpers | Launch alerts and Pro upgrade alerts |

---

## 6. Route catalogs and safe probes

If you need a quick inventory instead of grepping the repo:

- `lib/admin/route-catalog.ts` — curated admin route inventory with risk/auth/write metadata

Use this before adding more ad hoc admin status docs.

---

## 7. Analytics and launch docs

Start with:

- `docs/ANALYTICS_OVERVIEW.md`
- `docs/POSTHOG_LAUNCH_DASHBOARDS_ELI5.md`
- `docs/POSTHOG_FEEDBACK_DASHBOARDS_SPEC.md`
- `docs/LAUNCH_DAY_RUNBOOK.md`
- `docs/MOBILE_ADMIN_CONTROL.md`

These cover:

- consent model
- website vs server analytics
- app launch dashboards
- feedback signal expectations
- what to ignore before launch

---

## 8. Where to look first if...

| Problem | Start here |
|---|---|
| App config feels stale | `/api/mobile/bootstrap`, `docs/MOBILE_ADMIN_CONTROL.md` |
| Scanner analytics say nothing | `/admin/app-scanner`, `/api/admin/scanner-analytics/overview`, PostHog setup |
| Launch cockpit looks wrong | `/admin/mobile-command-center`, `lib/admin/mobile-command-center.ts` |
| Pro upgrades mismatch | Stripe webhook, RevenueCat webhook, entitlements debug |
| Feedback seems to vanish | `/api/feedback`, `/api/chat/report`, feedback dashboard/admin docs |
| Cron or background job seems stale | `docs/CRONS.md`, affected `/api/cron/*` route |
| AI tool issue seems app-specific | corresponding `/api/mobile/*` route before generic website route |
| Shared/public link breaks | relevant `/api/*/share*` route + app shared route |

---

## 9. Companion docs

- `docs/MOBILE_ADMIN_CONTROL.md`
- `docs/CRONS.md`
- `docs/IMPLEMENTATION_REFERENCE.md`
- `docs/ANALYTICS_OVERVIEW.md`

Cross-repo counterpart:

- `C:\Users\davy_\Projects\Manatap-APP\docs\ROUTES_TOOLS_WORKFLOWS_INDEX.md`

Keep this doc concise and navigational. Update it when adding major admin surfaces, mobile-support APIs, or background pipelines.
