# ManaTap Website / Backend Instructions

This repo is the ManaTap website and backend for the mobile app.

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
