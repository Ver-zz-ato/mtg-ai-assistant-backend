# Security Invariants Checklist

**Purpose:** This checklist defines non-negotiable security rules that must never be violated. Future contributors will break things; this checklist is the guardrail.

**Last Updated:** January 10, 2026

---

## 🚫 Never Do These

### 1. **No Client-Trusted Counters**
- ❌ **NEVER** trust client-provided counters for rate limiting, usage tracking, or quotas
- ✅ **ALWAYS** enforce limits server-side using database-backed counters
- **Example Violation:** `if (req.body.messageCount < 10) allow()` ❌
- **Correct Approach:** Check `guest_sessions` table server-side ✅

### 2. **No Raw HTML Without Sanitization**
- ❌ **NEVER** use `dangerouslySetInnerHTML` with unsanitized user input or AI-generated content
- ✅ **ALWAYS** sanitize with `sanitizeHTML()` from `frontend/lib/sanitize.ts` before rendering
- **How to verify:** Search diff for `dangerouslySetInnerHTML` or `__html` and ensure `sanitizeHTML()` is called first
- **Explicit Exceptions (must be documented in code):**
  - Static blog posts (server-generated HTML from your repo) - Still sanitize by policy, but mark as "trusted source" in code comments
  - Example comment: `// Trusted source: Static markdown from repo - sanitized for defense-in-depth`
- **Rule:** Even "trusted" sources get sanitized. The exception is just documentation, not a bypass.
- **Files to check:** Any component using `dangerouslySetInnerHTML`

### 3. **No exec_sql or Generic SQL Execution**
- ❌ **NEVER** use generic SQL execution RPCs like `exec_sql(sql: string)`
- ✅ **ALWAYS** use purpose-built RPC functions with whitelists and validation
- **Current Safe RPCs:** 
  - `vacuum_analyze_table(target_table TEXT)` - Whitelist-only
  - `migrate_cache_schema()` - Specific operation
- **If you need new SQL operations:** Create a new specific RPC function, don't add to exec_sql

### 4. **No javascript: Links or Dangerous Protocols**
- ❌ **NEVER** allow `javascript:`, `data:`, or other dangerous protocols in URLs
- ✅ **ALWAYS** use `sanitizeURL()` from `frontend/lib/sanitize.ts` for any user-provided URLs
- **Check:** Links, iframes, redirects, any URL handling

### 5. **No Missing Origin Checks on State-Changing Routes** (Model A: Strict)
- ❌ **NEVER** allow POST/PUT/DELETE/PATCH routes without CSRF protection
- ✅ **ALWAYS** use `validateOrigin(req)` from `frontend/lib/api/csrf.ts` on ALL state-changing routes
- **Protected routes:** Billing, admin actions, profile updates, ANY route that changes state (POST/PUT/DELETE/PATCH)
- **How to verify:** Search diff for `export async function POST|PUT|DELETE|PATCH` and ensure `validateOrigin(req)` is called early in handler
- **Explicit Exemptions (rare):**
  - Stripe webhooks (`/api/stripe/webhook`) - Uses signature verification instead
  - Public idempotent endpoints (if any) - Document why they're exempt
  - Routes protected by one-time signed tokens (magic links, etc.) - Must document exemption
- **Rationale:** Browser-first app with Supabase cookies = strict Model A. Fewer "oops we forgot" incidents.

### 6. **No IP-Based Primary Enforcement**
- ❌ **NEVER** use IP addresses as the primary method for rate limiting or authentication
- ✅ **ALWAYS** use tokens, cookies, or user IDs for primary enforcement
- **Note:** IP hashing is fine for secondary correlation/anomaly detection, but not blocking
- **Why:** IPs can be shared (work Wi-Fi) or rotated (mobile networks)

### 7. **No Rate Limiting Without Atomic Operations**
- ❌ **NEVER** use "SELECT then UPDATE" pattern for rate limiting (race condition)
- ✅ **ALWAYS** use atomic increment RPCs like `increment_rate_limit()` or database-level atomic operations
- **Scope:** This rule applies to **durable/shared rate limiting** stored in DB/Redis (not in-memory limits where atomicity is per-process)
- **Migration:** Run `026_atomic_rate_limit_increment.sql` to enable atomic increments
- **How to verify:** Search for rate limiting code using database/Redis - ensure it uses atomic operations (RPC functions or `INSERT ... ON CONFLICT DO UPDATE`)

### 8. **No Admin Actions Without Audit Logging**
- ❌ **NEVER** perform admin actions without logging to `admin_audit` table
- ✅ **ALWAYS** log: actor_id, action, target, timestamp
- **Required for:** Pro status changes, config changes, schema migrations, any admin operation
- **How to verify:** Search for admin routes (`/api/admin/*`) and confirm `admin_audit.insert()` is called

### 9. **No Secrets in Client Bundles**
- ❌ **NEVER** expose server secrets via `NEXT_PUBLIC_*` environment variables or client-side props
- ❌ **NEVER** commit secrets to git (even in `.env` files that might be committed)
- ✅ **ALWAYS** keep secrets server-only; only expose public keys (Stripe publishable key `pk_*` is fine)
- ✅ **ALWAYS** use server-side environment variables without `NEXT_PUBLIC_` prefix for secrets
- **Forbidden patterns in client code:**
  - `process.env.STRIPE_SECRET_KEY` (should be `sk_*`)
  - `process.env.SUPABASE_SERVICE_ROLE_KEY`
  - `process.env.OPENAI_API_KEY`
  - `BEGIN PRIVATE KEY` or `BEGIN RSA PRIVATE KEY`
- **How to verify:** CI grep rule for patterns: `sk_`, `supabase.*service.*role`, `BEGIN.*PRIVATE KEY`, `NEXT_PUBLIC_.*SECRET`
- **Common mistake:** Renaming env var to `NEXT_PUBLIC_*` accidentally exposes it to client bundle

### 10. **No Auth Bypass via "Trusting Headers"**
- ❌ **NEVER** treat the existence of a header (`x-vercel-id`, `x-forwarded-for`, `x-real-ip`, etc.) as authentication
- ❌ **NEVER** allow requests just because a header exists - headers can be forged
- ✅ **ALWAYS** require a shared secret (`CRON_KEY` env var) or verified signature/JWT for authentication
- ✅ **ALWAYS** log authentication failures as security events
- **Example violation:** `if (req.headers.get('x-vercel-id')) allow()` ❌
- **Correct approach:** `if (header === process.env.CRON_KEY || hasValidSignature(req)) allow()` ✅
- **How to verify:** Search for cron endpoints and auth checks - ensure they validate secrets/signatures, not just header presence
- **Files to check:** All `/api/cron/*` routes, webhook handlers

---

## ✅ Always Do These

### 1. **Input Validation**
- ✅ **ALWAYS** validate all inputs with Zod schemas
- ✅ **ALWAYS** sanitize user-generated content before storage/display
- **Files:** All API routes should have input validation

### 2. **Error Handling**
- ✅ **ALWAYS** sanitize error messages before sending to client (no stack traces, no SQL errors)
- ✅ **ALWAYS** log full error details server-side (for debugging)
- **Principle:** Full details server-side, sanitized messages client-side

### 3. **Authentication Checks**
- ✅ **ALWAYS** verify user authentication before sensitive operations
- ✅ **ALWAYS** check admin status with `isAdmin()` function (don't hardcode)
- **Files:** All protected routes should check `supabase.auth.getUser()`

### 4. **Environment Variables**
- ✅ **ALWAYS** use environment variables for secrets (never commit to git)
- ✅ **ALWAYS** validate required env vars at startup (`frontend/lib/env.ts`)
- **Required vars:** See `docs/SECURITY_AUDIT.md` → Environment Variables Required

### 5. **Security Event Logging**
- ✅ **ALWAYS** log security-relevant events (rate limits, CSRF failures, admin actions)
- ✅ **ALWAYS** use `logSecurityEvent()` from `frontend/lib/api/security-events.ts`
- **Events to log:** Rate limit triggers, CSRF failures, guest token validation failures, admin actions

---

## 🔍 Review Checklist for PRs

Before merging any PR, verify:

- [ ] No new `dangerouslySetInnerHTML` without `sanitizeHTML()` (grep: `dangerouslySetInnerHTML`)
- [ ] No new `exec_sql` or generic SQL execution (grep: `exec_sql`)
- [ ] All POST/PUT/DELETE routes have CSRF protection (grep: `export async function POST|PUT|DELETE`, check for `validateOrigin`)
- [ ] No client-trusted counters or limits (grep: `messageCount`, `guestMessageCount`, check for server-side enforcement)
- [ ] Rate limiting uses atomic operations (check durable rate limiting files for atomic RPCs)
- [ ] Admin actions are logged to `admin_audit` table (grep: `/api/admin`, check for `admin_audit.insert`)
- [ ] Input validation with Zod schemas (check API routes for Zod validation)
- [ ] Error messages are sanitized (no stack traces to client) (grep: `error.message`, check for sanitization)
- [ ] No secrets in client bundles (grep: `NEXT_PUBLIC_.*SECRET|sk_|service.*role`, check no server secrets exposed)
- [ ] No header-based auth without secrets/signatures (check cron/webhook routes)
- [ ] New environment variables documented (check for new `process.env.*` usage)

---

## 📚 Reference Files

- **CSRF Protection:** `frontend/lib/api/csrf.ts`
- **Sanitization:** `frontend/lib/sanitize.ts`
- **Security Events:** `frontend/lib/api/security-events.ts`
- **Rate Limiting:** `frontend/lib/api/durable-rate-limit.ts`
- **Guest Tracking:** `frontend/lib/guest-tracking.ts`
- **Full Audit:** `docs/SECURITY_AUDIT.md`

---

## 🤖 Auto-Enforcement

✅ **CI Workflow Created:** `.github/workflows/security-checks.yml`

This workflow automatically checks security invariants on PRs and pushes:
- ❌ **FAILS** if `exec_sql` is reintroduced
- ❌ **FAILS** if service role keys or private keys detected
- ⚠️ **WARNS** if secrets might be exposed via `NEXT_PUBLIC_*`
- ⚠️ **WARNS** if `dangerouslySetInnerHTML` used (manual review needed)
- ⚠️ **WARNS** if header-based auth without secret validation

**Status:** Ready to use - runs automatically on PRs to `main` branch.

### ESLint Rule (Future Enhancement)
- Flag `dangerouslySetInnerHTML` unless file imports `sanitizeHTML` and uses it
- Example: Custom ESLint rule that checks for sanitization before `__html` usage
- **Status:** Not implemented yet - CI grep checks catch most cases

### Pre-commit Hook (Optional)
- Run grep checks before commit for faster feedback
- Copy checks from `.github/workflows/security-checks.yml`
- **Status:** Not implemented - CI workflow provides sufficient protection

---

## 🚨 If You See a Violation

1. **Don't merge** the PR
2. **Document** the issue clearly
3. **Fix** it before merging
4. **Update** this checklist if a new pattern emerges
5. **Consider** adding auto-enforcement if violation is common

**Remember:** Security is not optional. These rules exist because breaking them has real consequences. Reviewers are lazy meat robots - help them with clear "how to verify" steps.
