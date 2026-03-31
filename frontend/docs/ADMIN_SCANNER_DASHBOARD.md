# Admin: mobile scanner analytics dashboard

**Purpose:** Read-only admin page for mobile card-scanner metrics from **PostHog** (HogQL), aligned with app events `scan_card_*` and `scan_ai_*`.

## URLs

| Path | Role |
|------|------|
| `/admin/app-scanner` | Dashboard UI (protected by `AdminGuard`) |
| `/api/admin/scanner-analytics/overview?days=7` | JSON aggregates (admin session required) |

**Why `/admin/app-scanner`:** Matches existing **app-prefixed** admin routes (`/admin/ai-usage-app`, `/admin/app-ai-feedback`, `/admin/app-whats-new`) so mobile tooling stays grouped consistently.

## Server configuration

Uses the same credentials as `scripts/audit-phase2/posthog-events.ts`:

- `POSTHOG_PERSONAL_API_KEY` — Project Settings → Personal API Keys (Query read)
- `POSTHOG_PROJECT_ID` — Project Settings → Project ID
- `POSTHOG_HOST` / `NEXT_PUBLIC_POSTHOG_HOST` — optional (default `https://eu.posthog.com`)

If keys are missing, the API returns `ok: false`, `error: posthog_not_configured` and the UI shows the hint.

## Code map

| File | Role |
|------|------|
| `lib/server/posthog-hogql.ts` | HogQL HTTP helper |
| `app/api/admin/scanner-analytics/overview/route.ts` | Aggregations |
| `app/admin/app-scanner/page.tsx` | Dashboard |
| `app/admin/JustForDavy/page.tsx` | Nav link under **Mobile & Client Control** |

## Metrics (summary)

- **Overview tiles:** scanner opens, add initiated vs completed, canonical / fail-open rates (from `scan_card_add_initiated`), AI assist usage (% `match_source=ai`), AI assist blocked count, auto-add usage rate.
- **Funnel:** Independent counts for key `scan_card_*` steps (not session-bound).
- **Quality breakdowns:** `name_resolution`, `match_source`, `add_confirm_method` on add initiated.
- **AI Assist:** blocked by reason; fallback started / success / failed; `is_network` on failures; top error strings.
- **Auto-add:** canonical vs fail-open rates by `auto_add_enabled`.
- **Persist labeling:** `will_persist_to_supabase` breakdown — **false** includes new-deck intent without DB write; do not equate add initiated with persisted adds.

Older builds may omit properties; breakdowns show `(unset)` and overview rates exclude unknown splits where noted on the page.

---

## REVERT (remove this pass)

To fully undo this feature:

1. Delete `frontend/lib/server/posthog-hogql.ts`
2. Delete the folder `frontend/app/api/admin/scanner-analytics/` (or remove `overview/route.ts` and the empty dirs)
3. Delete the folder `frontend/app/admin/app-scanner/` (or remove `page.tsx`)
4. In `frontend/app/admin/JustForDavy/page.tsx`, remove the **Scanner analytics** link object from **Mobile & Client Control**
5. Remove this doc: `frontend/docs/ADMIN_SCANNER_DASHBOARD.md`
6. In `frontend/docs/IMPLEMENTATION_REFERENCE.md`, remove the **Admin scanner analytics** subsection if present
7. In `frontend/CHANGELOG.md`, remove the dated entry for this dashboard (optional; history can stay)

No database migrations. No `Manatap-APP` changes.
