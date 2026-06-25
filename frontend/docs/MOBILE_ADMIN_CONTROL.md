# Mobile admin control plane (website)

Admin UI and APIs live in the **Next.js website** (`frontend/`). The mobile app consumes read-only config via `GET /api/mobile/bootstrap`. All writes go through authenticated admin routes using the same allowlist as other admin tools (`ADMIN_USER_IDS` / `ADMIN_EMAILS`).

## Database (Supabase)

Migration: `db/migrations/097_mobile_admin_control.sql`

| Table | Purpose |
|-------|---------|
| `feature_flags` | Boolean toggles + optional JSON payload per key; `platform` narrows delivery. |
| `remote_config` | Arbitrary JSON per key (hero copy, section order, `mobile.tiers.limits`, etc.). |
| `app_changelog` | Mobile “What’s New” rows (schedule, version window, priority). |

**RLS:** Enabled on all three tables with **no** policies for `anon` / `authenticated` — direct client access is denied. The Next.js server uses the **service role** client (`getAdmin()`), which bypasses RLS.

**Overlap:** The legacy `app_config` key `app_changelog` (JSON blob) still exists for older tooling (`/admin/JustForDavy/app-whats-new`). New bootstrap **What’s New** data comes from the `app_changelog` **table**. Treat the table-backed bootstrap payload as canonical for launch.

## Admin routes (UI)

All under `/admin/*`, protected by `AdminGuard` + server-side admin checks on mutating APIs.

| Path | Role |
|------|------|
| `/admin/remote-config` | List / create / edit remote config keys (if present) |
| `/admin/app-whats-new` | List / create / edit `app_changelog` rows |
| `/admin/tier-limits` | Edit `mobile.tiers.limits` (validated JSON) |
| `/admin/mobile-bootstrap-preview` | Debug view; same payload as public bootstrap |
| `/admin/app-scanner` | PostHog scanner funnel / quality (requires PostHog personal API key on server; see `docs/ADMIN_SCANNER_DASHBOARD.md`) |
| `/admin/mobile-command-center` | Phone-friendly launch cockpit for app health, AI spend, signups, PostHog, revenue, Sentry, rate limits, feedback, and ops freshness |
| `/admin/voice-analytics` | Structured app voice command telemetry, clarify/follow-up QA, and export |

Dashboard entry: **Admin → Mobile & Client Control** (`/admin/JustForDavy`).

## Mobile Command Center

The launch cockpit is intentionally **website-only**. No admin UI or vendor SDK access is added to the Expo app, so mobile users do not download admin code and secrets stay server-side.

Routes:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/mobile-command-center/overview` | Combined launch health and urgent alerts |
| GET | `/api/admin/mobile-command-center/ai` | App AI cost, errors, cache reuse, expensive users/routes |
| GET | `/api/admin/mobile-command-center/users` | Supabase signups, Pro/free mix, masked recent rows |
| GET | `/api/admin/mobile-command-center/analytics` | PostHog scanner/tool/monetization/feedback health, plus instrumentation gaps |
| GET | `/api/admin/mobile-command-center/revenue` | RevenueCat/Stripe entitlement and webhook health |
| GET | `/api/admin/mobile-command-center/errors` | Sentry unresolved issues plus local `error_logs` |
| GET | `/api/admin/mobile-command-center/security` | Durable rate limits, `ops_rate_limit_hit`, advisor reminders, admin audit |
| GET | `/api/admin/mobile-command-center/feedback` | App AI reports and generic feedback caveats |
| GET | `/api/admin/mobile-command-center/ops` | Background job health, cache freshness, settings freshness, and control links |
| POST | `/api/admin/mobile-command-center/refresh-rollups` | Admin/cron-protected rollup refresh and optional Discord alert send |
| POST | `/api/admin/mobile-command-center/test-discord` | Admin-only one-off Discord channel test |
| GET | `/api/cron/mobile-command-center-rollups` | Cron-only hourly rollup refresh with deduped Discord alerts |

Optional env:

- `DISCORD_ADMIN_ALERT_WEBHOOK`
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- `REVENUECAT_V2_SECRET_API_KEY`, `REVENUECAT_PROJECT_ID`
- `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`

PostHog note: the browser key (`NEXT_PUBLIC_POSTHOG_KEY`) only sends events. The cockpit uses the Query API/HogQL, so it needs a server-only personal API key with `query:read` scope and the PostHog project ID. Use `POSTHOG_HOST=https://eu.posthog.com` for the EU app/API host; do not use the ingest host (`eu.i.posthog.com`) for Query API reads.

Discord note: `DISCORD_ADMIN_ALERT_WEBHOOK` is preferred for launch alerts. The cockpit also accepts `DISCORD_APPSUB_WEBHOOK`, `DISCORD_APP_SUBS_WEBHOOK`, or `DISCORD_WEBHOOK_URL` as fallback env names so existing server-only webhook config can be reused.

Discord send policy:

- Normal page loads and `Refresh` do not send Discord messages.
- `Rollups` refreshes cached snapshots and alert rows, but stays quiet.
- `Test Discord` sends one explicit manual test message.
- **Hourly cron** posts only critical launch alerts: failed Tier-1 price jobs (`bulk_price_import`, `price_snapshot_bulk`, `deck-costs`), critical Sentry/error spikes, or missing Supabase admin config.
- **Daily digest (22:30 UTC)** via `/api/cron/ops-report/daily` covers analytics, revenue, Discover job freshness (`meta-signals`, `commander-aggregates`, `top-cards`), rate-limit counts, and dashboard watch metrics. Only critical items are promoted into the digest watch list as launch alerts.
- **Weekly digest (Sundays 07:00 UTC)** via `/api/cron/ops-report/weekly` covers Scryfall bulk import, legality refresh, and budget swaps freshness.
- Hourly reminders: critical alerts can repeat after about 1 hour if they are still open or the detail changes.

Daily launch alert ELI5:

Discord launch alerts should mean "something is seriously wrong," not "something is mildly worth watching." Yellow dashboard metrics still appear in the cockpit and daily report, but they no longer become launch alerts by themselves.

| Alert title | What it means | What to do |
|-------------|---------------|------------|
| `Supabase admin client is not configured` | The cockpit cannot read private launch data. | Fix server-only Supabase admin env before trusting launch health. |
| `AI cost` | App AI spend hit the critical threshold. | Check AI tab for expensive routes/features/users; look for bots or runaway loops. |
| `AI errors` | More than 10% of app AI requests failed. | Check AI tab by route/model, then Sentry/local errors. |
| `Sentry unresolved` | Sentry has a critical number of unresolved issues. | Open Sentry and fix the newest user-facing crash first. |
| `Local error logs` | Backend/API errors hit the critical threshold. | Check repeated paths/messages in the Errors tab. |
| `Daily price jobs` | A required price job failed. | Open `/admin/ops`; prices/deck costs may stop refreshing. |
| `Pipeline jobs` | A monitored background job failed. | Open `/admin/ops` and fix jobs marked failed. |

These are watch metrics, not launch alerts unless they become critical in code later:

- rate-limit hits
- no signups
- signup spikes
- optional RevenueCat API missing
- warning-level Sentry counts
- stale Scryfall/config freshness
- low AI cache reuse
- feedback submission warning counts

Analytics note:

- The cockpit now reads the real mobile app event families already in use, not only scanner-specific names.
- Quiet scanner or feedback rows before launch are treated as informational when the broader app analytics stream is healthy.
- The AI cache card is intentionally plain-English: it is measuring how often app AI reused a saved answer, but only on rows that actually reported cache info.
- The Analytics tab is intended to answer four quick questions:
  - Is the scanner funnel emitting events?
  - Are tool funnels emitting start/success/failure signals?
  - Is the upgrade/paywall funnel visible?
  - Are feedback and issue-report flows visible, including submission failures?

Suggested PostHog launch dashboards:

1. App Tool Funnel Health
   - Trends/funnels: `tool_opened`, `tool_action_started`, `tool_action_completed`, `tool_action_failed`
   - Break down by `tool`, `source_screen`, `user_tier`, `is_guest`, `analytics_actor_id`
   - For Pro-user failures, inspect `tool_action_failed` where `tool IN ('card_search', 'deck_analyze')` by `error_type`, `error_code`, `user_tier`, and `source_screen`
2. Scanner Funnel
   - Trends: `scan_card_capture_completed`, `scan_card_match_completed`, `scan_card_add_completed`, `scan_card_session_completed`
   - Break down by `result_state`, `match_source`, `source_screen`, `is_guest`
3. Monetization Funnel
   - Trends/funnels: `pro_gate_viewed`, `pro_upgrade_started`, `pro_upgrade_completed`
   - Break down by `source_path`, `context`, `platform`, `source_feature`, `analytics_actor_id`
4. Feedback + Friction
   - Trends: `feedback_sent`, `analysis_feedback_submitted`, `chat_issue_report_submitted`, `feedback_submission_failed`
   - Break down by `source`, `source_surface`, `source_feature`, `context`

Companion docs:

- `docs/POSTHOG_LAUNCH_DASHBOARDS_ELI5.md` — plain-English meaning of each live dashboard and what counts as normal before launch
- `docs/POSTHOG_FEEDBACK_DASHBOARDS_SPEC.md` — feedback-specific event and dashboard checklist
- `docs/LAUNCH_DAY_RUNBOOK.md` — launch-day order of checks and what to investigate first
- `docs/ROUTES_WORKFLOWS_PIPELINES_INDEX.md` — wider route, workflow, webhook, and cron map for future debugging

Migration: `db/migrations/115_mobile_command_center_rollups.sql`

Private tables:

| Table | Purpose |
|-------|---------|
| `admin_app_metric_snapshots` | Cached metric rollups for fast phone checks and cron refreshes |
| `admin_app_alerts` | Alert history, dedupe keys, status, payload, and Discord send metadata |

Identity is masked in list views by default. Use the existing support, entitlement debug, Stripe sync, feedback triage, moderation queue, and ops pages for one-user investigations or mutating controls.

Moderation note:

- `/admin/moderation` is the first-pass queue for public profile/share/comment reports.
- New reports from `POST /api/moderation/reports` (mobile app or website) can ping Discord when `DISCORD_MODERATION_WEBHOOK` is set (falls back to `DISCORD_ADMIN_ALERT_WEBHOOK` / `DISCORD_WEBHOOK_URL`). Discord failure does not block report submission.
- `/admin/support` includes subscription support per selected user (RevenueCat entitlements, store subs, TRANSFER/webhook audit) plus moderation (warn, note, ban, unban) and GDPR actions.

Ops tab note:

- The Ops tab is meant to answer simple questions quickly:
  - Did the important background jobs run?
  - When did they last work?
  - Are mobile settings fresh?
  - Does the Scryfall cache look recently updated?

## Admin API (JSON)

| Method | Path |
|--------|------|
| GET/POST | `/api/admin/mobile/feature-flags` |
| GET/POST | `/api/admin/mobile/remote-config` |
| GET/POST | `/api/admin/mobile/app-changelog` |
| GET/POST | `/api/admin/mobile/tier-limits` |
| GET | `/api/admin/mobile/bootstrap-preview` |

POST routes require a same-site origin (CSRF helper `validateOrigin`). Successful writes may append rows to `admin_audit` (`mobile_*` actions).

## Public bootstrap API

`GET /api/mobile/bootstrap`

Query parameters:

- `platform` — `ios` | `android` | `mobile` | `all` | `web` (default: treat as `mobile` if omitted).
- `version` — optional app version string for changelog filtering and min/max windows.

Caching: `Cache-Control: public, s-maxage=60, stale-while-revalidate=120`.

### Response shape

```json
{
  "ok": true,
  "generatedAt": "2026-03-23T12:00:00.000Z",
  "featureFlags": {
    "mobile.enable_roast": { "enabled": true, "value": {} }
  },
  "remoteConfig": {
    "mobile.home.hero": { "title": "…" },
    "mobile.update": {
      "minSupportedVersion": "1.0.80",
      "recommendedVersion": "1.0.82",
      "severity": "recommended",
      "title": "Update available",
      "body": "Get the latest ManaTap fixes and improvements."
    }
  },
  "tierLimits": {
    "guest": {
      "chatPerDay": 10,
      "deckAnalysisPerDay": 3,
      "roastPerDay": 3,
      "voicePerDay": 10,
      "mulliganAdvicePerDay": 3,
      "cardExplainPerDay": 3,
      "deckComparePerDay": 0,
      "generateFromCollectionPerDay": 0,
      "generateConstructedPerDay": 3
    },
    "free": {
      "chatPerDay": 30,
      "deckAnalysisPerDay": 10,
      "roastPerDay": 5,
      "voicePerDay": 30,
      "mulliganAdvicePerDay": 10,
      "cardExplainPerDay": 20,
      "deckComparePerDay": 5,
      "generateFromCollectionPerDay": 5,
      "generateConstructedPerDay": 5
    },
    "pro": {
      "chatPerDay": 500,
      "deckAnalysisPerDay": 200,
      "roastPerDay": 25,
      "voicePerDay": 999999,
      "mulliganAdvicePerDay": 999999,
      "cardExplainPerDay": 999999,
      "deckComparePerDay": 999999,
      "generateFromCollectionPerDay": 999999,
      "generateConstructedPerDay": 30
    }
  },
  "whatsNew": [
    {
      "title": "…",
      "body": "…",
      "platform": "mobile",
      "minAppVersion": null,
      "maxAppVersion": null,
      "priority": 10
    }
  ]
}
```

Assembly logic is centralized in `lib/mobile/bootstrap.ts` (`buildMobileBootstrapPayload`).

`mobile.tiers.limits` is now treated as a per-function override layer, not a fully separate truth source. The server resolves the final bootstrap payload by merging:

1. backend safe defaults
2. admin-managed `remote_config["mobile.tiers.limits"]` overrides
3. intentional route/platform exceptions where product rules differ

The mobile app should display the resolved bootstrap values and should not hardcode separate entitlement truth when bootstrap is available.

Important:

- App-facing bootstrap values should be concrete positive numbers only.
- For genuinely uncapped Pro surfaces, use the large client-safe placeholder `999999` instead of `-1`.
- For truly capped surfaces, use the real enforced cap in bootstrap so client hints and pre-gates stay aligned.

## Mobile support dependency note

`GET /api/mobile/bootstrap` is not just a convenience route. It is the server-owned control plane for:

- feature rollout (`feature_flags`)
- remote tuning / copy (`remote_config`)
- mobile tier limits (`remote_config["mobile.tiers.limits"]`)
- What’s New content (`app_changelog`)

If these tables are empty, stale, or misconfigured, the mobile app still runs, but feature gating and launch messaging can drift from expectations.

## Adding a feature flag

Use Supabase (`feature_flags` table) or `POST /api/admin/mobile/feature-flags` (admin auth). The dedicated `/admin/feature-flags` UI was removed in 2026-06.

1. Set `key` (e.g. `mobile.enable_roast`), `enabled`, optional JSON `value`, `platform`.
2. Save. The flag appears in the next bootstrap response for matching platforms.

### Tournament Manager beta allowlist

Use `feature_flags` key `tournament_manager_beta` to surface the mobile Tournament Manager host/join entry outside dev builds while the rollout is controlled.

Recommended value:

```json
{
  "emails": ["tester@example.com"]
}
```

Set `enabled = true` and `platform = all` unless testing only one platform. The app lowercases signed-in user emails before comparing. Use `"*"` only for a broad public beta.

## Adding remote config

1. Open `/admin/remote-config`.
2. Use a dotted key (e.g. `mobile.home.hero`) and valid JSON (object or array).
3. Save. Clients read `remoteConfig[key]` from bootstrap.

### App update banner

Use remote config key `mobile.update` to show a small Home banner when an installed iOS or Android app is behind the configured version.

Recommended value:

```json
{
  "minSupportedVersion": "1.0.80",
  "recommendedVersion": "1.0.82",
  "severity": "recommended",
  "title": "Update available",
  "body": "Get the latest ManaTap fixes and improvements."
}
```

Fields:

- `minSupportedVersion`: app versions below this show a required, non-dismissible banner.
- `recommendedVersion`: app versions below this show a dismissible update banner.
- `latestVersion`: optional fallback if `recommendedVersion` is omitted.
- `severity`: optional `recommended` or `required`; `minSupportedVersion` always wins.
- `iosUrl` / `androidUrl`: optional store links. If omitted, the app uses its built-in App Store / Google Play URL.

## Mobile client usage

On cold start or when refreshing remote config:

1. `GET /api/mobile/bootstrap?platform=android&version=1.2.3`
2. Merge `featureFlags` / `remoteConfig` / `tierLimits` / `whatsNew` into local state.
3. Do not cache secrets in the client; this endpoint is non-sensitive config only.

## Rollback

1. **Code:** Revert the PR that added these files/routes.
2. **Database:** Run a down migration manually (drop `feature_flags`, `remote_config`, `app_changelog`) only if no longer needed — confirm no dependencies first.
3. **Runtime:** Removing routes leaves old app builds calling `/api/mobile/bootstrap` with 404 until the app stops calling it.

## Files (reference)

- `lib/admin-auth.ts` — `isAdminUser`
- `lib/mobile/bootstrap.ts`, `lib/mobile/validation.ts`, `lib/mobile/semver-compare.ts`
- `app/api/mobile/bootstrap/route.ts`
- `app/api/admin/mobile/*/route.ts`
- Admin pages under `app/admin/app-whats-new`, `mobile-command-center`, etc. (`feature_flags` via API/SQL — no dedicated UI page)
