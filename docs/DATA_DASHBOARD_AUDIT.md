# Data Dashboard — Pre-Implementation Audit (Phase 0)

## 1. Admin layout / route conventions

- **Layout:** `app/admin/layout.tsx` wraps all admin routes in `<AdminGuard>{children}</AdminGuard>`. No shared sidebar; each page is self-contained.
- **Guard:** `components/AdminGuard.tsx` — client component; fetches `/api/admin/config`, checks `data.is_admin`, redirects non-admins to `/`. Admin status from `getServerSupabase()` + `isAdmin(user)` (ADMIN_USER_IDS, ADMIN_EMAILS env).
- **Index:** `app/admin/page.tsx` redirects to `/admin/justfordavy`.
- **Convention:** Admin pages live under `app/admin/<section>/page.tsx`. Many are `"use client"` and fetch from `app/api/admin/*` routes. No route groups for admin.

## 2. Reusable admin UI / table / card / chart

- **Cards/sections:** Common pattern is `<div className="rounded border border-neutral-800 p-3">` or `max-w-4xl mx-auto p-4 space-y-6` (e.g. `admin/data/page.tsx`, `admin/ai-usage/page.tsx`).
- **Help:** `@/components/AdminHelp` — `ELI5`, `HelpTip` used on data page.
- **Charts:** `recharts` is used in `admin/ai-usage/page.tsx` (AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar). Safe to reuse for simple tables/bars; avoid heavy charts if data is sparse.
- **Tables:** No shared table component; pages use `<table className="...">` or simple `<ul>`/map. Prefer simple HTML tables for dashboard.

## 3. Server-side Supabase for admin

- **Pattern:** API routes use `getAdmin()` from `@/app/api/_lib/supa` (service role). Used in many `app/api/admin/*` routes. No session needed for read-only admin data when called from server.
- **Auth for API:** `app/api/admin/config/route.ts` uses `getServerSupabase()` for user, then `isAdmin(user)`. For read-only dashboard, we can add routes under `/api/admin/datadashboard/*` that check admin then use `getAdmin()` for queries, or we can use Server Components that call data helpers using `getAdmin()` — but Server Components cannot access cookies for auth by default; the guard is client-side. So the safe pattern is: **admin API routes** that verify admin via session then use getAdmin(), and **client pages** that fetch those APIs. Alternatively, Server Components can call getAdmin() for data and the layout already ensures only admins see the page (client redirect). To avoid exposing admin data if someone hits the URL without going through the guard, we should either protect the API (check isAdmin in API) or rely on RLS — our new tables have RLS with service-role only, so anon/user cannot read them. So only server-side getAdmin() can read. Dashboard pages will be client components that fetch from new **admin API routes** that (1) verify admin, (2) use getAdmin() to query, (3) return JSON. That matches existing admin patterns.

## 4. Auth/role guard

- **Client:** `AdminGuard` in layout; redirects if not admin.
- **API:** Admin API routes that mutate or return sensitive data should call `getServerSupabase()`, get user, then `isAdmin(user)` (same logic as config route). We will add GET routes under `/api/admin/datadashboard/*` and enforce admin check there.

## 5. Plan summary

| Item | Plan |
|------|------|
| **Files to add** | `app/admin/datadashboard/page.tsx`, `app/admin/datadashboard/suggestions/page.tsx`, `app/admin/datadashboard/deck-metrics/page.tsx`, `app/admin/datadashboard/meta-trends/page.tsx`; `lib/data-dashboard/get-suggestions-dashboard.ts`, `get-deck-metrics-dashboard.ts`, `get-meta-trends-dashboard.ts`, `get-data-dashboard-overview.ts`; `app/api/admin/datadashboard/overview/route.ts`, `suggestions/route.ts`, `deck-metrics/route.ts`, `meta-trends/route.ts` (GET, admin check, then call data helpers). |
| **Files to touch** | None for existing flows. Optional: add a small shared nav component for datadashboard subpages. |
| **Risks** | (1) New tables may be empty — UI must handle empty state. (2) Charting: use simple tables first; add recharts only where aggregates are straightforward. |
| **Charting** | recharts exists in admin/ai-usage. We will use **simple tables and KPI cards** first; add bars only if safe and data shape is clear. |

## 6. Implementation approach

- **Data layer:** `lib/data-dashboard/*.ts` — pure read-only functions that take Supabase admin client (from getAdmin()), run defensive queries, return typed shapes. No auth inside these; caller (API route) ensures admin.
- **API routes:** GET handlers that get user via getServerSupabase(), check isAdmin(), then getAdmin(), then call data-dashboard helpers and return JSON.
- **Pages:** Client components that fetch from these APIs and render cards/tables with loading and empty states.
