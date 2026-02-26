# Cursor Agent Handover — ManaTap AI

> **Audience:** Cursor AI agent (or human) designing or modifying the app.  
> **Purpose:** Enough context to work safely in this codebase without breaking auth, limits, or conventions.

---

## 1. What This App Is

- **Product name:** ManaTap AI (branding); repo/code may still say "MTG AI Assistant".
- **What it does:** AI-powered Magic: The Gathering deck assistant for Commander: chat, deck analysis, budget swaps, mulligan simulator, price tracking, collections, playstyle quiz.
- **Full feature list:** See **`docs/APP_FEATURES_AND_FUNCTIONS.md`** for every user-facing feature and API.

---

## 2. Repo Layout

- **`frontend/`** — The app. Next.js 15 (App Router), React 19, all UI + API routes.
- **`frontend/app/`** — Pages (`page.tsx`) and API routes (`api/**/route.ts`).
- **`frontend/components/`** — React components.
- **`frontend/lib/`** — Shared logic: auth, AI, Supabase, Scryfall, rate limits, prompts, etc.
- **`frontend/hooks/`** — e.g. `useAuth`, `useProStatus`.
- **`frontend/db/`** — Supabase migrations (SQL). Schema lives in Supabase; migrations are the source of truth.
- **`backend/`** — Optional/legacy scripts (e.g. bulk jobs, seed data); main app is **frontend**.

**When adding something:**  
- New **page** → `frontend/app/<path>/page.tsx`.  
- New **API** → `frontend/app/api/<path>/route.ts`.  
- Shared **logic** → `frontend/lib/` or `frontend/hooks/`.

---

## 3. Tech Stack (Don’t Replace Without Good Reason)

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) |
| UI | React 19, Tailwind CSS 4, Framer Motion |
| Auth + DB | Supabase (Auth + Postgres) |
| AI | OpenAI (chat, deck analysis, embeddings) |
| Payments | Stripe (subscriptions) |
| Analytics | PostHog (consent-gated) |
| Errors | Sentry |

---

## 4. Auth (Critical)

- **Provider:** Supabase Auth. No custom auth; use Supabase only.
- **Client:** `AuthProvider` from **`@/lib/auth-context`** (push-based; avoids getSession() races). Use **`useAuth()`** in components for `user`, `session`, `loading`.
- **Server/API:** Always use the **server** Supabase client so the JWT is read from cookies:
  - **`import { createClient } from "@/lib/supabase/server"`**  
  - (That re-exports from **`@/lib/server-supabase`**.)
- **Getting the current user in API routes:**
  ```ts
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  ```
- **Guest users:** Many features allow unauthenticated use with lower limits. Use `user ?? null` and a stable guest key (e.g. hash of IP or session) for rate limits; see **`lib/feature-limits.ts`** and **`lib/api/durable-rate-limit.ts`**.

**Do not:** Call `getSession()` in tight loops or on every navigation; use the push-based auth context on the client.

---

## 5. Pro vs Free vs Guest (Tiers and Limits)

- **Tiers:** `guest` (anonymous), `free` (signed-in), `pro` (paid).
- **Pro status:** Stored on `profiles.is_pro` (and synced from Stripe). Client uses **`useProStatus()`** from **`@/hooks/useProStatus`** for `isPro`, `modelTier`, `modelLabel`.
- **Limit constants:** **`frontend/lib/feature-limits.ts`** — e.g. `DECK_ANALYZE_FREE`, `DECK_ANALYZE_PRO`, `MULLIGAN_ADVICE_GUEST`. Use these in API routes; do not hardcode numbers.
- **Enforcement:** Feature limits are enforced with **durable** rate limits (Supabase-backed), not in-memory:
  - **`frontend/lib/api/durable-rate-limit.ts`** → `checkDurableRateLimit(supabase, userKeyHash, routeId, dailyCap, increment)`.
- **Chat limits:** **`frontend/lib/limits.ts`** — `GUEST_MESSAGE_LIMIT`, `FREE_DAILY_MESSAGE_LIMIT`, `PRO_DAILY_MESSAGE_LIMIT`. Pro numbers are server-only; do not show in UI.

When adding a new gated feature:
1. Add constants to **`lib/feature-limits.ts`** (or **`lib/limits.ts`** for chat).
2. In the API route, resolve user (or guest key), then call `checkDurableRateLimit` with the right cap for that tier before doing work.

---

## 6. API Route Conventions

- **Handler signature:** `export async function GET/POST(req: NextRequest) { ... }`.
- **Supabase:** `const supabase = await createClient();` (from **`@/lib/supabase/server`**).
- **Auth:** `const { data: { user } } = await supabase.auth.getUser();` then branch on `user` for guest vs signed-in.
- **Rate limits:** For feature limits use **`checkDurableRateLimit`** from **`@/lib/api/durable-rate-limit`** with a stable `userKeyHash` (user id or hashed IP/session for guests) and the route key and daily cap from **`lib/feature-limits.ts`**.
- **Responses:** Return `NextResponse.json({ ok: true, ... })` or `NextResponse.json({ ok: false, error: "..." })`. For rate limit, return something like `{ ok: false, code: "RATE_LIMIT_DAILY", resetAt, proUpsell }` so the client can show upgrade messaging.
- **Admin routes:** Under **`app/api/admin/`**. Protect by checking `user` and that the user is an admin (e.g. profile flag or env allowlist); do not expose admin APIs to the public.

---

## 7. Key Directories and Files

| Path | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout; AuthProvider, Providers, analytics, consent, etc. |
| `app/page.tsx` | Homepage (chat + tools strip + trending). |
| `components/Providers.tsx` | Prefs, Toast, Pro providers; PostHog init after consent. |
| `lib/auth-context.tsx` | Push-based auth context; useAuth(). |
| `lib/server-supabase.ts` | Server Supabase client (cookies); createClient(), createClientForStatic(). |
| `lib/supabase/server.ts` | Re-exports server-supabase (use this in API routes). |
| `lib/supabase/client.ts` | Browser Supabase client (use in client components only). |
| `lib/feature-limits.ts` | Daily caps per feature (guest/free/pro). |
| `lib/limits.ts` | Chat message limits. |
| `lib/api/durable-rate-limit.ts` | checkDurableRateLimit (Supabase-backed). |
| `lib/ai/` | OpenAI client, model-by-tier, prompt-path, prompts. |
| `lib/deck/` | Deck parsing, inference, validators, archetypes. |
| `hooks/useProStatus.ts` | isPro, modelTier, upgradeMessage. |

---

## 8. Running and Testing

- **Dev:** From **`frontend/`**: `npm run dev` → [http://localhost:3000](http://localhost:3000).
- **Build:** `npm run build` (from `frontend/`).
- **Env:** No `.env` committed. You need `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and optionally OpenAI, Stripe, PostHog, Sentry keys. Use `.env.local` for local dev.
- **Regression tests:** From `frontend/`: `npm run color-tests`, `npm run chat-tests` (see **`frontend/README.md`**).
- **E2E:** Playwright; see `frontend/package.json` scripts (`test:e2e`, `test:canary`, etc.).

---

## 9. Database (Supabase)

- **Migrations:** **`frontend/db/`** (e.g. `migrations/*.sql`). Apply via Supabase CLI or dashboard.
- **Important tables:** `profiles`, `decks`, `deck_cards`, `chat_threads`, `chat_messages`, `collections`, `wishlists`, `rate_limit_*` (for durable limits), `ai_usage`, `deck_costs`, `price_snapshots`. Do not assume schema from this list alone; check migrations.
- **RLS:** Supabase RLS is used. Server code uses the anon key with the user’s JWT; row access is enforced by RLS.

---

## 10. AI (OpenAI)

- **Client/config:** **`lib/ai/openai-client.ts`** (or unified LLM client). Model selection by tier in **`lib/ai/model-by-tier.ts`**.
- **Prompts:** Versioned prompts / config in **`lib/config/prompts`** and **`lib/ai/prompt-path.ts`**. Deck analysis uses **`lib/deck/`** (inference, validators, role baselines, commander profiles).
- **Cost/usage:** AI calls are logged (e.g. `ai_usage` table) for cost and limits. New AI features should follow the same logging pattern used in existing routes.

---

## 11. Conventions and Gotchas

- **Next 15:** `cookies()` is async; use `await cookies()` in API routes and server code to avoid sync/async warnings.
- **Pro limits in UI:** Do not display exact Pro daily numbers in the UI (e.g. “500 messages”); show only Free limits and “Pro gets more.”
- **Imports:** Use `@/` alias for `frontend/` (e.g. `@/lib/auth-context`, `@/components/Header`).
- **Redirects:** `next.config.ts` has redirects (e.g. `/budget-swaps` → `/deck/swap-suggestions`). Keep them in mind when adding links or routes.
- **Images:** Remote images allowed from `cards.scryfall.io` (see `next.config.ts`). Use `next/image` for card images.
- **Analytics:** PostHog is consent-gated; do not track PII before consent. Use **`lib/ph.ts`** and existing event helpers.

---

## 12. References

- **Feature list (for app version / copy):** **`docs/APP_FEATURES_AND_FUNCTIONS.md`**
- **Frontend readme:** **`frontend/README.md`** (dev, regression tests)
- **DB migrations:** **`frontend/db/`** and **`frontend/db/README.md`** if present

---

## 13. Checklist for New Features

- [ ] Auth: Use `createClient()` and `getUser()` in API; use `useAuth()` / `useProStatus()` in UI.
- [ ] Limits: Add constants to `feature-limits.ts` (or `limits.ts`); enforce with `checkDurableRateLimit` where applicable.
- [ ] Responses: Return `{ ok, error?, code? }`; for rate limit include `code: "RATE_LIMIT_DAILY"` and optional `proUpsell`, `resetAt`.
- [ ] Admin: If the route is under `api/admin/`, restrict to admins only.
- [ ] AI: If calling OpenAI, use shared client and model-by-tier; log usage if the project does so elsewhere.
- [ ] No hardcoded Pro limits in UI; no PII in analytics before consent.

---

## 14. App version / mobile: Pulling card data from `scryfall_cache`

The **app version** (e.g. mobile or another client) that needs card data should use one of these approaches. The most common failure is **RLS** (Row Level Security) blocking reads when the app uses the Supabase client directly, or **name normalization** mismatches.

### Option A: Use the existing HTTP APIs (recommended)

Call the Next.js API; no direct Supabase access or RLS needed from the app.

| Use case | Endpoint | Method | Request | Response |
|----------|----------|--------|---------|----------|
| **Batch card images** | `https://<your-domain>/api/cards/batch-images-chat` | POST | `{ "names": ["Sol Ring", "Command Tower"] }` | `{ "ok": true, "images": { "sol ring": { "small", "normal", "art_crop" }, ... } }` |
| **Batch card metadata** | `https://<your-domain>/api/cards/batch-metadata` | POST | `{ "names": ["Sol Ring", ...] }` | `{ "data": [{ "name", "type_line", "oracle_text", "color_identity", "image_uris", "set", "rarity" }, ...], "not_found": [...] }` |
| **Single card name lookup** (resolve/canonicalize) | `https://<your-domain>/api/cards/cache-lookup?name=...` | GET | `?name=Sol Ring` | `{ "ok": true, "name": "sol ring" }` or 404 |

- **Base URL:** Use the same origin as the web app (e.g. `https://www.manatap.ai`). The app must be able to reach this (CORS is allowed for API routes by default in Next.js; if the app is on a different domain, ensure CORS headers allow it or proxy through your backend).
- **Auth:** These card APIs do not require auth; they work with the anon key when called from the server (Next.js API uses server Supabase client). When the **app** calls them over HTTP, no Supabase token is needed.

### Option B: Supabase client from the app (direct read)

If the app uses the Supabase JS client (e.g. `createClient(url, anon_key)` or `createClientWithBearerToken(accessToken)` from **`lib/server-supabase.ts`** for mobile), then **RLS must allow SELECT** on `scryfall_cache`. Otherwise every direct `.from('scryfall_cache').select(...)` returns empty or errors.

- **Migration:** Run **`db/migrations/037_scryfall_cache_rls_read.sql`** in Supabase (SQL Editor or migration runner). It adds a policy so that **anon** and **authenticated** roles can **SELECT** from `scryfall_cache` (read-only; no INSERT/UPDATE/DELETE from the app).
- **Bearer token for mobile:** Use **`createClientWithBearerToken(accessToken)`** (in `lib/server-supabase.ts`) only on the server. From the mobile app, use the standard Supabase client with the user’s session (e.g. `supabase.auth.getSession()` and pass the access token). RLS then runs as that user; the new policy allows SELECT for any authenticated user too.

### Name normalization (critical)

`scryfall_cache` stores the **`name`** column in **normalized** form. All lookups (both HTTP APIs and direct Supabase queries) must use this same normalization, or rows won’t match.

Use this exact function (or equivalent in your stack):

```ts
function normalizeCardName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")  // remove combining marks
    .replace(/\s+/g, " ")
    .trim();
}
```

- **Examples:** `"Sol Ring"` → `"sol ring"`; `"Jodah, the Unifier"` → `"jodah, the unifier"`; accents removed (e.g. `"Lim-Dûl"` → `"lim-dul"`).
- **Batch requests:** When calling batch APIs or `.in("name", names)`, pass **normalized** names. The APIs above accept display names and normalize internally for lookup; when querying Supabase directly from the app, you **must** pass normalized names.

### Schema (reference)

`scryfall_cache` columns used by the app: **`name`** (PK, normalized), **`small`**, **`normal`**, **`art_crop`** (image URLs), **`type_line`**, **`oracle_text`**, **`color_identity`** (array), **`rarity`**, **`set`**, **`cmc`**, **`mana_cost`**, **`updated_at`**. Query only the columns you need.

### If the app still gets no data

1. **RLS:** Confirm migration **037** has been applied (policy exists on `scryfall_cache` for SELECT).
2. **Normalization:** Log the exact `name` values you send; they must match the normalized form in the DB.
3. **Network:** If using HTTP APIs, confirm the app can reach the base URL and that response is 200 with body `{ "ok": true, "images": {...} }` or similar (not 403/500).
4. **CORS:** If the app runs in a browser (e.g. PWA) on another domain, ensure the API allows that origin (Next.js API routes may need explicit CORS if you see blockings).

---

*Document generated for Cursor agent handover. Update as the codebase evolves.*
