# Marketing Radar (admin)

Internal admin tool for collecting MTG marketing signals, generating AI briefs, and drafting social/blog content for **manual approval only**. Nothing auto-posts.

## Access

- **UI:** `/admin/marketing-radar` (protected by `AdminGuard` + env allowlist)
- **Auth:** `ADMIN_USER_IDS` / `ADMIN_EMAILS` on all API routes via `requireAdminForApi()`

## Database

Apply migration manually in Supabase SQL Editor:

`frontend/db/migrations/138_marketing_radar.sql`

Tables: `marketing_sources`, `marketing_signals`, `marketing_briefs`, `marketing_drafts`

See `docs/SUPABASE_SCHEMA.md` (Marketing Radar section).

## Workflow

1. Open `/admin/marketing-radar` while signed in as admin.
2. **Paste signals** — Reddit threads, forum posts, Discord snippets (optional title/URL).
3. Review **Discover meta context** (from existing `meta_signals` cron).
4. Click **Run brief** — AI blends manual signals + meta snapshot, creates a new brief and platform drafts.
5. **Edit / Approve / Reject** drafts — copy approved content manually to X, Instagram, blog, or Reddit.

Each run creates a **new** brief (history is kept in DB; UI shows latest).

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/marketing-radar` | Dashboard payload (latest brief, drafts, signals, meta snapshot) |
| POST | `/api/admin/marketing-radar/signals` | Ingest manual paste into `marketing_signals` |
| POST | `/api/admin/marketing-radar/run` | Generate brief + drafts (OpenAI server-side) |
| PATCH | `/api/admin/marketing-drafts/[id]` | Update draft `content`, `status`, or `notes` |

Draft statuses: `draft`, `approved`, `rejected`.

## AI

- Server function: `lib/marketing/generateMarketingBrief.ts`
- Model: `MODEL_ADMIN_DEEP` → `MODEL_PRO` → `OPENAI_MODEL` → `gpt-5.4`
- Usage logged via `callLLM` / `ai_usage` with feature `marketing_radar_brief`

## Manual test checklist

1. Apply migration `138_marketing_radar.sql`
2. Sign in as admin
3. Paste sample EDH discussion → signal appears in recent list
4. Run brief → summary + drafts render (needs signals and/or meta_signals data)
5. Save / approve / reject a draft → persists on refresh
6. Run again → new brief becomes latest; older briefs remain in DB
7. Non-admin user → redirected from page; APIs return 404

## Future hooks (not implemented)

- Reddit / YouTube / X fetchers writing to `marketing_signals`
- Brief history picker in UI
- Optional daily cron (pattern: `/api/cron/meta-signals` + `verifyCronRequest`)
