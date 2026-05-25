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
| `/admin/feature-flags` | List / create / edit feature flags |
| `/admin/remote-config` | List / create / edit remote config keys |
| `/admin/app-whats-new` | List / create / edit `app_changelog` rows |
| `/admin/tier-limits` | Edit `mobile.tiers.limits` (validated JSON) |
| `/admin/mobile-bootstrap-preview` | Debug view; same payload as public bootstrap |
| `/admin/app-scanner` | PostHog scanner funnel / quality (requires PostHog personal API key on server; see `docs/ADMIN_SCANNER_DASHBOARD.md`) |
| `/admin/mobile-command-center` | Phone-friendly launch cockpit for app health, AI spend, signups, PostHog, revenue, Sentry, rate limits, feedback, and ops freshness |

Dashboard entry: **Admin → Mobile & Client Control** (`/admin/JustForDavy`).

## Mobile Command Center

The launch cockpit is intentionally **website-only**. No admin UI or vendor SDK access is added to the Expo app, so mobile users do not download admin code and secrets stay server-side.

Routes:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/mobile-command-center/overview` | Combined launch health and urgent alerts |
| GET | `/api/admin/mobile-command-center/ai` | App AI cost, errors, cache rate, expensive users/routes |
| GET | `/api/admin/mobile-command-center/users` | Supabase signups, Pro/free mix, masked recent rows |
| GET | `/api/admin/mobile-command-center/analytics` | PostHog scanner/tool/monetization/feedback health, plus instrumentation gaps |
| GET | `/api/admin/mobile-command-center/revenue` | RevenueCat/Stripe entitlement and webhook health |
| GET | `/api/admin/mobile-command-center/errors` | Sentry unresolved issues plus local `error_logs` |
| GET | `/api/admin/mobile-command-center/security` | Durable rate limits, `ops_rate_limit_hit`, advisor reminders, admin audit |
| GET | `/api/admin/mobile-command-center/feedback` | App AI reports and generic feedback caveats |
| GET | `/api/admin/mobile-command-center/ops` | Bootstrap/config freshness and job/control links |
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
- The hourly cron posts only current `warn` / `critical` launch alerts that are new, changed, escalated, unsent, or old enough for a reminder. Critical alerts can repeat after about 1 hour; warning alerts after about 6 hours.

Analytics note:

- The cockpit now reads the real mobile app event families already in use, not only scanner-specific names.
- Quiet scanner or feedback rows before launch are treated as informational when the broader app analytics stream is healthy.
- The Analytics tab is intended to answer four quick questions:
  - Is the scanner funnel emitting events?
  - Are tool funnels emitting start/success/failure signals?
  - Is the upgrade/paywall funnel visible?
  - Are feedback and issue-report flows visible, including submission failures?

Suggested PostHog launch dashboards:

1. App Tool Funnel Health
   - Trends/funnels: `tool_opened`, `tool_action_started`, `tool_action_completed`, `tool_action_failed`
   - Break down by `tool`, `source_screen`, `user_tier`, `is_guest`
2. Scanner Funnel
   - Trends: `scan_card_capture_completed`, `scan_card_match_completed`, `scan_card_add_completed`, `scan_card_session_completed`
   - Break down by `result_state`, `match_source`, `source_screen`, `is_guest`
3. Monetization Funnel
   - Trends/funnels: `pro_gate_viewed`, `pro_upgrade_started`, `pro_upgrade_completed`
   - Break down by `source_path`, `context`, `platform`, `source_feature`
4. Feedback + Friction
   - Trends: `feedback_sent`, `analysis_feedback_submitted`, `chat_issue_report_submitted`, `feedback_submission_failed`
   - Break down by `source`, `source_surface`, `source_feature`, `context`

Migration: `db/migrations/115_mobile_command_center_rollups.sql`

Private tables:

| Table | Purpose |
|-------|---------|
| `admin_app_metric_snapshots` | Cached metric rollups for fast phone checks and cron refreshes |
| `admin_app_alerts` | Alert history, dedupe keys, status, payload, and Discord send metadata |

Identity is masked in list views by default. Use the existing support, entitlement debug, Stripe sync, feedback triage, and ops pages for one-user investigations or mutating controls.

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
    "mobile.home.hero": { "title": "…" }
  },
  "tierLimits": {
    "guest": { "chatPerDay": 3, "deckAnalysisPerDay": 2, "roastPerDay": 1 },
    "free": { "chatPerDay": 10, "deckAnalysisPerDay": 5, "roastPerDay": 3 },
    "pro": { "chatPerDay": -1, "deckAnalysisPerDay": -1, "roastPerDay": -1 }
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

## Mobile support dependency note

`GET /api/mobile/bootstrap` is not just a convenience route. It is the server-owned control plane for:

- feature rollout (`feature_flags`)
- remote tuning / copy (`remote_config`)
- mobile tier limits (`remote_config["mobile.tiers.limits"]`)
- What’s New content (`app_changelog`)

If these tables are empty, stale, or misconfigured, the mobile app still runs, but feature gating and launch messaging can drift from expectations.

## Adding a feature flag

1. Open `/admin/feature-flags`.
2. Set `key` (e.g. `mobile.enable_roast`), `enabled`, optional JSON `value`, `platform`.
3. Save. The flag appears in the next bootstrap response for matching platforms.

## Adding remote config

1. Open `/admin/remote-config`.
2. Use a dotted key (e.g. `mobile.home.hero`) and valid JSON (object or array).
3. Save. Clients read `remoteConfig[key]` from bootstrap.

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
- Admin pages under `app/admin/feature-flags`, `remote-config`, `app-whats-new`, `tier-limits`, `mobile-bootstrap-preview`
