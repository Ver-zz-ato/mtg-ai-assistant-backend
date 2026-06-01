# ManaTap Website / Backend Instructions

This repo is the ManaTap website and backend for the mobile app.

## Next.js And App Router Discipline

- Prefer existing route, layout, server component, and data-fetching patterns before introducing new ones.
- Keep server-only logic, secrets, privileged queries, and service-role operations server-side.
- Avoid moving logic into client components unless there is a clear UX reason.
- Be explicit about caching, revalidation, and request-time versus build-time behavior when changing data flows.

## API And Contract Discipline

- Any mobile-facing API contract change must state whether it is backward-compatible in the final answer.
- For risky backend, API, schema, or integration changes, include a short rollback note in the final answer.
- Any new Supabase table or column used by mobile should include RLS by default unless there is a documented exception.
- Any endpoint returning deck or card data should avoid overfetching and should call out required field changes when the response shape changes.
- Before adding new MTG parsing, formatting, or deck-rule logic, check for an existing helper or shared implementation first.
- Preserve support for non-Commander decks when touching shared deck logic. Do not assume every deck is Commander.
- Every new or changed endpoint should make clear who can call it, what auth it expects, whether guests are allowed, what rate limiting applies, and whether the change is backward-compatible.
- Validate inputs before business logic and keep response shapes stable unless the user approves a contract change.

## Mobile Contract Stability

- Treat the mobile app as a live client even when the website uses the same backend.
- Avoid renaming, removing, or repurposing fields used by mobile without explicitly checking downstream impact.
- If a response shape changes, update the relevant docs and call out app impact in the final answer.

## Admin, Cron, And Internal Route Rules

- Admin, debug, cron, and internal routes must never rely on obscurity alone.
- Require a server-side secret, admin verification, or equivalent trusted gate for privileged routes.
- Be explicit about idempotency, retries, and duplicate-trigger behavior for cron or job-like flows.
- Call out meaningful side effects and failure behavior when changing internal automation paths.

## Supabase And Schema Discipline

- Prefer additive schema changes over breaking ones unless the user explicitly approves a breaking change.
- Any mobile-facing or user-facing schema change should mention RLS impact in the final answer.
- Migrations should preserve backward compatibility where possible.
- Be clear about nullable versus required fields when adding or changing schema.

## Website UI Discipline

- Preserve the existing website design language unless the user asks for a redesign.
- Reuse shared components, tokens, and existing patterns before introducing new UI variants.
- Keep mobile web responsiveness in mind for website UI work.
- Avoid adding UI complexity when the real issue is data, API behavior, or state handling.

## Performance And Caching Discipline

- Avoid overfetching deck, card, and user payloads.
- Prefer existing caching, revalidation, and shared fetch-helper patterns where they already exist.
- Use caching or prewarming when it materially reduces repeated heavy work and fits the current architecture.
- Call out stale-data or cache-invalidation tradeoffs when adding or changing cache layers.

## MTG Logic Discipline

- Preserve Commander and non-Commander behavior intentionally when touching shared deck logic.
- Do not collapse mainboard and sideboard distinctions unless the user explicitly asks for that behavior.
- Do not assume all deck endpoints or analysis flows are Commander-only.
- Reuse existing deck normalization, card normalization, and format-handling logic where possible.

## Release And Verification Discipline

- For changes that touch auth, decks, scans, purchases, sync, or navigation, include a short user-impact note in the final answer.
- If a change could affect app-store behavior via shared auth, purchases, linking, notifications, or policy-sensitive flows, call that out explicitly.
- Final answers must separate what was verified from what was not verified.
- If a small fix starts requiring a broader refactor, pause and surface the scope change before expanding the task.
- For API changes, say exactly which route or handler was checked.
- For frontend website changes, say exactly which page or user flow was checked.
- If mobile impact exists, say whether app impact was tested directly or only inferred from the backend change.

## Standing Security Rules

1. Never create or modify a public API endpoint without an explicit auth/guest decision, rate limit, input validation, and ownership checks.
2. Never trust client-provided `user_id`, role, tier, entitlement, price, model, token limit, or admin status.
3. All user-owned data access must be scoped server-side to the authenticated user.
4. All Supabase user-owned tables must use RLS unless there is a documented exception.
5. Service role keys must only be used server-side and never returned, logged, bundled, or exposed to the client.
6. All AI endpoints must enforce request size limits, usage limits, model allowlists, and safe fallback behavior.
7. All admin, debug, and cron endpoints must require a server-side secret or admin verification.
8. Public errors must not expose stack traces, SQL details, env vars, prompts, or provider internals.
9. Validate inputs with schemas before business logic. Reject unknown, oversized, or malformed fields.
10. Any security-sensitive change must include a short "Security impact" note and list affected routes/tables.
