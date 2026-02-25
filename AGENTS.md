# AGENTS.md

## Cursor Cloud specific instructions

### Project overview
ManaTap AI is an AI-powered Magic: The Gathering deck-building assistant. The monorepo has three services:
- **frontend/** — Next.js 15 (React 19) on port 3000. This is the primary product; most API logic lives in Next.js API routes.
- **backend/** — Legacy Flask (Python) + Express (Node.js) backend on port 5000. Optional for most dev work.
- **bulk-jobs-server/** — Express server for bulk MTG data imports on port 3001. Optional.

### Running services

- **Frontend dev server:** `npm run dev` from `frontend/`. Requires `.env.local` with Supabase/OpenAI/Stripe env vars (see `frontend/lib/env.ts` for the required list). The middleware warns on missing vars in dev mode but does not crash.
- The health endpoint at `/api/health` is useful for verifying the server is responding.
- Supabase is a hosted service (no local DB to start). Database features require real `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Lint, test, build

- **Lint:** `npm run lint` in `frontend/` (ESLint 9 flat config). The codebase has pre-existing lint warnings/errors.
- **Unit tests:** `npm run test:unit` in `frontend/` (runs 7 test files via `tsx`).
- **E2E tests:** `npm run test:e2e` in `frontend/` (Playwright). Requires a running dev server and real Supabase credentials.
- **Build:** `npm run build` in `frontend/`.

### Gotchas

- The `frontend/.env.local` file is gitignored. You must create it with at least the 5 required env vars from `frontend/lib/env.ts` (placeholder values allow the dev server to start, but features requiring real API calls will fail).
- There is a harmless "Duplicate page detected" warning for `sitemap.ts` / `sitemap.xml/route.ts` on dev server startup.
- The root `package.json` and `requirements.txt` are not used for the main frontend dev workflow; each service has its own dependency files.
