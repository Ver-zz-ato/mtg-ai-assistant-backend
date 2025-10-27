# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Common commands

- Install deps: `npm ci` (or `npm install`)
- Dev server: `npm run dev`
- Build: `npm run build`
- Start (after build): `npm run start`
- Lint: `npm run lint`
- E2E tests (Playwright): `npm run test:e2e`
  - Single spec: `npm run test:e2e -- tests/e2e/cost-to-finish.spec.ts`
  - Filter by test name: `npm run test:e2e -- -g "partial test name"`
  - If browsers are missing: `npx playwright install`
- Unit tests (run per-file with tsx):
  - Canonicalize: `npm run test:unit`
  - Assistant build: `npm run test:assistant`
  - Any unit file: `npx tsx tests/unit/<file>.ts` (e.g. `npx tsx tests/unit/colorPie.test.ts`)
- API smoke tests (if present): `npx tsx tests/api/<file>.ts`
- SEO checks: `npm run seo:check`

## High-level architecture

- Framework: Next.js (App Router) with React 19 and TypeScript. The `app/` directory contains both UI routes and API Route Handlers (`route.ts`).
- Pages and sections:
  - `app/admin/*`: admin/ops views (usage, pricing, backups, changelog, etc.).
  - `app/debug/*`: debugging pages used during development.
- API surface (domain-oriented under `app/api/*`):
  - Chat: `app/api/chat/*` provides thread/message CRUD and streaming (`chat/stream`).
  - Decks/Collections/Wishlists: endpoints for create/get/list/update, analysis, stats, and CSV upload.
  - Pricing/Scryfall: `app/api/price/*`, `app/api/cron/*` for price updates, snapshots, and cache warmers.
  - Billing: `app/api/billing/*` (checkout/portal) and `app/api/stripe/webhook`.
  - Misc: health (`app/api/health`), profile, rules search, events tools, etc.
- Shared server libs (`app/api/_lib`):
  - `supabase.ts` creates an SSR-safe Supabase server client via cookies using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - `supa.ts` provides helpers for reading auth cookies/JWT and creating an admin Supabase client when service creds are present.
  - `z.ts` contains zod schemas for chat/thread payloads.
- Client/shared libs (`lib/*`):
  - `analytics.ts` and `ph.ts` integrate PostHog (with consent guards on the client).
  - `streaming-pacer.ts` provides a client-side pacer to render streamed text at a steady rate; `streamWithPacer` helps consume `ReadableStream` responses.
- Configuration:
  - `next.config.ts` sets CSP headers, PostHog rewrites, image remote patterns, and build flags (ignore ESLint errors during build; fail on TS errors).
    - CSP allows Scryfall, Stripe, Ko‑fi, Supabase, and PostHog connections.
    - Rewrites route `/ingest/*` to PostHog EU endpoints.
    - Images allowed from `cards.scryfall.io`.
  - `tsconfig.json` is strict, `noEmit`, and defines `@/*` alias to project root.
  - `eslint.config.mjs` uses `next/core-web-vitals` + TypeScript config and warns on global `fetch` usage.
- Testing:
  - E2E: Playwright specs live in `tests/e2e/`.
  - Unit/utility tests: TypeScript files in `tests/unit/`, executed directly with `tsx` (no Jest/Vitest runner configured).
  - Additional API-style tests exist under `tests/api/` executed with `tsx`.
- CI/automation:
  - `.github/workflows/*` schedules and triggers maintenance tasks (e.g., price snapshots, cache cleanup, Scryfall prewarm) that correspond to routes in `app/api/cron/*`.

## Conventions and important notes

- HTTP calls: ESLint warns against raw `fetch`. Prefer the centralized wrapper (see rule in `eslint.config.mjs`; use `fetchJson` from `lib/http.ts` if available, or justify raw `fetch` with correct headers/cache handling).
- When adding external resources (images, scripts, frames, or network calls), update `next.config.ts` CSP, `images.remotePatterns`, and rewrites as needed; otherwise requests will be blocked in production.
- For analytics, respect the client-side consent guard in `lib/ph.ts`; analytics should be no-ops without consent.
- To add new API functionality, create a domain folder under `app/api/<domain>/.../route.ts` and validate input with zod (`app/api/_lib/z.ts`) where appropriate.
