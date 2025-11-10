This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Regression Tests

We rely on scripted regressions to keep the MTG suggestion pipeline honest. Run them from the `frontend` directory:

```bash
# Verify strict color identity rules
npm run color-tests

# Execute chat guardrail suites (all suites)
npm run chat-tests

# Or focus on one suite, e.g. format inference
npm run chat-tests -- --suite format
```

Both scripts emit JSON summaries; the `filteredCandidates` field in the `/api/deck/analyze` response can help explain why a suggestion was dropped.
