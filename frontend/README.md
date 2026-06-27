# ManaTap Frontend

Next.js website frontend for ManaTap.

## What lives here

- Public website pages and SEO routes
- Website API routes used by both web and app surfaces
- Shared MTG helpers, meta pipelines, pricing, and AI route logic
- Admin pages and operational tools

## Main folders

- `app/` - App Router pages and API routes
- `components/` - UI components
- `lib/` - server/client helpers, MTG logic, analytics, SEO, and integrations
- `tests/` - unit, integration, and Playwright coverage
- `docs/` - product and implementation notes

## Local development

Run from `C:\Users\davy_\Projects\mtg_ai_assistant\frontend`:

```bash
npm run dev
```

Default local URL:

```text
http://localhost:3000
```

## Useful checks

```bash
npx tsc --noEmit
npm run build
npm run lint
```

## Tests

```bash
# Targeted MTG/AI regression suites
npm run color-tests
npm run chat-tests

# Example focused chat suite
npm run chat-tests -- --suite format

# Playwright
npm run test:canary
npm run test:e2e
```

## Important docs

- `docs/HOW_TO_ADD_BLOGS_AND_CHANGELOGS.md`
- `docs/CRONS.md`
- `docs/MOBILE_ADMIN_CONTROL.md`
- `docs/archive-policy.md`

## Archive rule

Live source stays in `app/`, `components/`, and `lib/`.

Snapshot files such as `*.backup_*` should be moved to:

`C:\Users\davy_\Projects\mtg_ai_assistant\archive\frontend-snapshots\`
