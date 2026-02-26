# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

ManaTap AI is an AI-powered Magic: The Gathering Commander deck-building assistant. The **frontend** (Next.js 15, App Router) is the primary service — it contains all UI, API routes, and cron jobs. The `backend/` (Flask + Express) and `bulk-jobs-server/` are legacy/auxiliary and rarely needed for development.

### Running the frontend dev server

```bash
cd frontend
npm run dev          # http://localhost:3000
```

The app requires a `.env.local` in `frontend/` with at minimum `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. All secrets are injected as environment variables in the Cloud Agent VM — generate `.env.local` from them using a script like:

```python
python3 -c "
import os
vars = ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY',
'OPENAI_API_KEY','NEXT_PUBLIC_BACKEND_URL','NEXT_PUBLIC_DEV_API_PREFIX','NEXT_PUBLIC_POSTHOG_KEY',
'NEXT_PUBLIC_POSTHOG_HOST','ADMIN_USER_IDS','ADMIN_EMAILS','CRON_KEY','CRON_URL',
'STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
'PLAYWRIGHT_TEST_EMAIL','PLAYWRIGHT_TEST_PASSWORD','DISABLE_CONSOLE_LOGS',
'NEXT_PUBLIC_DISABLE_CONSOLE_LOGS','NEXT_PUBLIC_SITE_URL','LLM_LAYER0',
'OPENAI_ADMIN_API_KEY','NEXT_PUBLIC_SHOW_SUPPORT_WIDGETS']
with open('frontend/.env.local','w') as f:
  for v in vars:
    val=os.environ.get(v,'')
    if val: f.write(f'{v}={val}\n')
"
```

### Lint, test, build

All commands run from `frontend/`:

| Task | Command |
|------|---------|
| Lint | `npm run lint` |
| Unit tests | `npm run test:unit` |
| E2E tests (Playwright) | `npm run test:e2e` |
| Build | `npm run build` |

**Gotchas:**
- ESLint has ~3000 pre-existing errors. The project sets `eslint: { ignoreDuringBuilds: true }` in `next.config.ts`, so builds still succeed. Do not try to fix all lint errors.
- Playwright E2E tests require the dev server running at `localhost:3000` and configured `.env.local`. Install browsers with `npx playwright install --with-deps chromium`.
- Unit tests use `tsx` to run individual test files (no Jest/Vitest). See the `test:unit` script in `package.json` for the full list.
- The `tsconfig.json` excludes `app/api/deck/analyze/route.ts` from type-checking intentionally.

### Key architecture notes

- See `docs/CURSOR_AGENT_HANDOVER.md` for detailed auth, API, and feature-limit conventions.
- Supabase provides auth + Postgres DB; the anon key is used with RLS. Use `createClient()` from `@/lib/supabase/server` for server-side code.
- `NEXT_PUBLIC_*` env vars are baked into the client bundle at build/dev time; changes require restarting the dev server.
