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

**Overlap:** The legacy `app_config` key `app_changelog` (JSON blob) still exists for older tooling (`/admin/JustForDavy/app-whats-new`). New bootstrap **What’s New** data comes from the `app_changelog` **table**.

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

Dashboard entry: **Admin → Mobile & Client Control** (`/admin/JustForDavy`).

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
