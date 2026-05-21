# ManaTap launch security hardening

Last updated: 2026-05-21

Scope: `C:\Users\davy_\Projects\mtg_ai_assistant` website/backend plus mobile-facing API contracts used by `C:\Users\davy_\Projects\Manatap-APP`.

## Access control matrix

| Route class | Examples | Public? | Auth model | Rate limit | CSRF / origin | Notes |
|---|---|---:|---|---|---|---|
| Public read-only content | `/api/mobile/bootstrap`, `/api/decks/browse`, `/api/public-profile/[slug]`, `/api/cards/search` | Yes | None or optional Bearer | Needed only for fanout/heavy routes | No | Must return only public data. Prefer cache for Scryfall/search fanout. |
| Guest/free/pro AI | `/api/chat`, `/api/chat/stream`, `/api/deck/analyze`, `/api/deck/roast`, `/api/mobile/deck/roast-ai`, `/api/mulligan/advice`, `/api/cards/recognize-image`, `/api/mobile/card/explain` | Yes, where product allows guest | Cookie or Bearer; guest token or IP fallback | Required, durable DB-backed | Bearer accepted for mobile; browser writes should use origin checks where practical | Cost-control critical. Do not rely on client-side guest caps. |
| Signed-in user CRUD | decks, collections, wishlists, profile, chat threads | No | Supabase user via cookie or Bearer | Optional abuse/burst limit | Same-origin or Bearer for mutating browser/mobile routes | Must enforce user ownership in SQL/RLS or server query filters. |
| Social writes | comments, likes, shoutbox/report flows | Partly | User or guest depending feature | Required for spam-prone writes | Same-origin or Bearer | Add profanity/moderation and per-user/IP burst limits. |
| Billing and webhooks | Stripe, RevenueCat, billing portal | No | Webhook signature or signed-in user | Provider-side plus server checks | Origin checks for browser billing actions | Never trust client entitlement changes. |
| Admin APIs | `/api/admin/*` | No | Supabase user + `ADMIN_USER_IDS`/`ADMIN_EMAILS` | Useful for dangerous actions | Required for mutating browser actions | Service role may be used after admin verification only. |
| Cron / bulk jobs | `/api/cron/*`, `/api/bulk-jobs/*`, bulk worker | No | `Authorization: Bearer <CRON_SECRET>` | Optional | No browser CSRF needed | Query-string cron keys are temporary compatibility only; prefer Bearer. |
| Legacy Flask backend | root `render.yaml`, `backend/app.py` | No for `/api` AI | `LEGACY_API_TOKEN` when `REQUIRE_LEGACY_API_AUTH=1` | In-memory IP window | CORS allowlist | Treat as legacy. Retire if Next API fully replaces it. |

## Public expensive endpoints

These routes must keep durable rate limits before any OpenAI, OCR, upload, Scryfall fanout, or long-running work:

- `/api/chat`
- `/api/chat/stream`
- `/api/chat/voice`
- `/api/deck/analyze`
- `/api/deck/compare-ai`
- `/api/deck/roast`
- `/api/mobile/deck/roast-ai`
- `/api/mobile/deck/compare-ai`
- `/api/mobile/card/explain`
- `/api/mulligan/advice`
- `/api/cards/recognize-image`
- `/api/cards/reprint-risk`
- `/api/custom-cards/generate`
- `/api/deck/finish-suggestions`
- `/api/deck/generate-constructed`
- `/api/deck/generate-from-collection`
- `/api/deck/health-suggestions`
- `/api/deck/swap-suggestions`
- `/api/deck/swap-why`
- `/api/deck/suggestion-why`
- `/api/collections/cost-to-finish`
- `/api/price/movers`
- `/api/price/deck-series`

Shared helper for new work: `frontend/lib/api/route-guard.ts`.

## Input validation baseline

Every public route that accepts user input should enforce:

- JSON parse failure returns `400`, not `500`.
- Text fields have max lengths.
- Arrays have max item counts.
- Enums use allowlists.
- UUID route/body params are validated before DB queries.
- File uploads have content type and size limits.
- AI routes validate both request and response shape.
- User-visible errors return safe copy; logs can keep internal details.

## Supabase RLS / grants audit

Code-derived status:

- `scryfall_cache` has public read RLS in migration `037_scryfall_cache_rls_read.sql`.
- `api_usage_rate_limits` is locked down in migrations `041` and `042`; `increment_rate_limit` should be executable by `service_role` only.
- Badge tables introduced in migration `044` have RLS and intended read policies.
- Several website-only tables have documented grant hardening in `docs/SUPABASE_SCHEMA.md`.
- Older `frontend/db/migrations/*` include security-definer/admin patterns that should be compared against the live DB before launch.

Pre-launch live DB checks to run in Supabase SQL editor:

```sql
-- Public schema tables without RLS.
select schemaname, tablename
from pg_tables
where schemaname = 'public'
  and rowsecurity = false
order by tablename;

-- Views that may run with definer privileges. Review all exposed public views.
select schemaname, viewname, definition
from pg_views
where schemaname = 'public'
order by viewname;

-- SECURITY DEFINER functions in exposed schemas. Review EXECUTE grants.
select n.nspname as schema, p.proname as function_name, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef = true
order by p.proname;
```

Supabase launch rule: any table exposed to `anon` or `authenticated` must either be intentionally public read-only data or protected by RLS policies that match the product model.

## Legacy backend decision

The root `render.yaml` still deploys `backend.app:app` as `mtg-ai-assistant-backend`. For launch:

- Preferred: disconnect this service if all traffic uses the Next.js APIs.
- If kept live: set `LEGACY_API_TOKEN`, keep `REQUIRE_LEGACY_API_AUTH=1`, keep `LEGACY_DEBUG_TOKEN`, and confirm CORS origins are production-only.
- Never put service role or OpenAI keys in any `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` variable.

## Launch monitors

Monitor these as first-launch health signals:

- 429 counts by route and tier.
- 401/403 counts by route.
- OpenAI request count, tokens, and cost by route.
- Upload/OCR failures and payload-too-large rejects.
- Webhook failures for Stripe and RevenueCat.
- Cron failures and stale cache tables.
- Supabase RLS/grant errors in server logs.
- Admin route unauthorized attempts.
- Guest abuse by IP/guest token.

Set alert thresholds before launch rather than after a spend spike.

