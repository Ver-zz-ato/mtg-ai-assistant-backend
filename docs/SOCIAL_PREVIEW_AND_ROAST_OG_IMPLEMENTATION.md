# Social Preview & Roast OG Implementation

Summary of what was implemented for the last two prompts: **Fix Missing Social Preview (OpenGraph / Twitter)** and **Add Dynamic OG Images for Roast Share Links**.

---

## 1. Fix Missing Social Preview (OpenGraph / Twitter)

**Goal:** Fix missing social preview thumbnails for links on X (Twitter), Discord, etc. by implementing proper Open Graph and Twitter metadata.

### 1.1 Root layout metadata

**File:** `frontend/app/layout.tsx`

- **metadataBase:** `new URL("https://www.manatap.ai")` (already present; kept).
- **Title / description:** Set to:
  - Title: `ManaTap AI — MTG Deck Builder & Assistant`
  - Description: `Build smarter decks. Analyze, optimize, explain.`
- **openGraph:** `title`, `description`, `url`, `siteName`, `type`, `locale`, and **images** pointing to `/opengraph-image.jpg` (1200×630, alt: "ManaTap AI — Your Complete Magic Companion").
- **twitter:** `card: "summary_large_image"`, `title`, `description`, **images:** `["/twitter-image.jpg"]`.

All image URLs resolve via `metadataBase` to:

- `https://www.manatap.ai/opengraph-image.jpg`
- `https://www.manatap.ai/twitter-image.jpg`

### 1.2 Static preview images

**Files created:**

- **`frontend/public/opengraph-image.jpg`** — Default OG image (1200×630). Dark MTG-themed card with “ManaTap AI — MTG Deck Builder & Assistant” and subtitle “Build smarter decks. Analyze, optimize, explain.”
- **`frontend/public/twitter-image.jpg`** — Same asset, used for `twitter:image`.

Both are served from `/public` and are compressed to **&lt;300 KB** for crawlers. To re-compress after replacing the source: from `frontend/` run `npm run scripts:compress-og` (uses `scripts/compress-og-images.mjs` and sharp).

### 1.3 Verification

The rendered HTML for the homepage includes:

- `og:title`, `og:description`, `og:image`, `og:url`
- `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`

---

## 2. Add Dynamic OG Images for Roast Share Links

**Goal:** Implement dynamic Open Graph / Twitter preview images for shared roast pages so links like `https://www.manatap.ai/roast/[id]` get a unique, rich preview on X, Discord, WhatsApp, Slack, etc.

### 2.1 Roast route metadata (`generateMetadata`)

**File:** `frontend/app/roast/[id]/page.tsx`

- **Truncate helper:** `truncate(text, max)` — strips `[[...]]` card refs, normalizes whitespace, truncates to `max` chars with "…". Used at 140 chars for meta description.
- **Heat labels (canonical):**  
  `gentle` → "Gentle 🙂", `balanced` → "Balanced 😏", `spicy` → "Spicy 🌶️", `savage` → "Savage 🔥". Fallback: "AI Roast".
- **Data:** Fetches `roast_permalinks` by `id` (fields: `commander`, `roast_level`, `roast_text`).
- **When roast exists:**
  - `title`: `${commanderName} got roasted 🔥 | ManaTap AI`
  - `description`: `${heatLabel}: ${excerpt}` (excerpt = truncate(roast_text, 140))
  - **openGraph:** `title`, `description`, `url`, `siteName`, `type`, **images:** `["https://www.manatap.ai/roast/${id}/opengraph-image"]`
  - **twitter:** `card: "summary_large_image"`, `title`, `description`, **images:** same URL.
- **When roast missing or error:** Fallback metadata with title "Roast My Deck — ManaTap AI", description "AI-powered Commander deck roasts", but **same** `openGraph.images` and `twitter.images` so the OG image route can still serve its fallback image.

### 2.2 Dynamic OG image route

**File:** `frontend/app/roast/[id]/opengraph-image.tsx`

- **Exports:** `alt`, `size = { width: 1200, height: 630 }`, `contentType = "image/png"`.
- **Default export:** Async function that receives `params: Promise<{ id: string }>`, fetches the same roast row via `createClientForStatic()` from `roast_permalinks`.
- **Truncate:** Same logic for any fallback text.
- **Best-burn extraction:** `extractBestBurn(roastText, 140)` — strips `[[...]]` refs, splits on sentence boundaries, picks a punchy one-liner (40–140 chars) so the share is a self-contained joke (e.g. "Your curve is flatter than a basic land."). Fallback: first sentence or truncated roast; if no text, "AI-powered Commander deck roast."
- **Heat labels:** Same mapping as in metadata (Gentle 🙂, Balanced 😏, Spicy 🌶️, Savage 🔥); fallback "AI Roast".
- **Heat accents (optional tint):** Gentle → green, Balanced → gold, Spicy → orange, Savage → red (badge background/border/text).
- **Layout (1200×630):**
  - **Top:** "ManaTap AI" (left) | "ROAST MY DECK" (right).
  - **Main:** Commander name → Heat badge → **Best burn line** (quoted, italic, hero) — the funniest roast line front and center so every shared link is a shareable joke.
  - **Bottom:** "manatap.ai" only.
- **Fallback when roast missing or fetch throws:** Generic `ImageResponse` with:
  - Same top/bottom branding.
  - "Roast My Deck" and "AI-powered Commander deck roasts" in the main area.
  - No private data; safe for all crawlers.

### 2.3 URL and behavior

- **Image URL:** `https://www.manatap.ai/roast/[id]/opengraph-image` (Next.js serves this from the `opengraph-image.tsx` file in that segment).
- **Metadata:** Each roast page has unique `title`, `description`, and explicit `openGraph.images` / `twitter.images` pointing to that URL.
- **Result:** Shared roast links get a custom title, description, and large image (commander, heat level, excerpt, ManaTap branding), or a generic fallback if the roast is missing.

---

## Files touched (combined)

| Action   | Path |
|----------|------|
| Modified | `frontend/app/layout.tsx` |
| Modified | `frontend/app/roast/[id]/page.tsx` |
| Modified | `frontend/app/roast/[id]/opengraph-image.tsx` |
| Created  | `frontend/public/opengraph-image.jpg` |
| Created  | `frontend/public/twitter-image.jpg` |

---

## Constraints respected

- No refactor of unrelated code; only metadata and OG image route.
- No DB schema changes.
- No client-only metadata; all server-side (generateMetadata + ImageResponse).
- No third-party OG service; Next.js `next/og` only.
- Roast page rendering and permalinks unchanged.
- Fallback when roast data is missing (generic OG image and fallback metadata).
- Root site-wide OG/Twitter and static images left intact; roast OG is additive.

---

## 3. Commander art on roast OG images

**Goal:** When a roast has a commander, the dynamic OG image can show that commander’s card art (when available).

### 3.1 Data source

- **First:** Use `commander_art_url` from `roast_permalinks` when the roast was saved with art.
- **Fallback:** Read-only lookup on **`scryfall_cache`** by normalized commander name: prefer `art_crop`, else `normal`. No live Scryfall request during OG generation.

### 3.2 Helper

**`getCommanderArtUrl(commanderName, rowArtUrl)`** in `opengraph-image.tsx`: returns `rowArtUrl` if valid HTTP; else strips parenthetical set name, normalizes with same `norm()` as scryfallCache, queries `scryfall_cache` for `art_crop` or `normal`; returns `null` on any failure.

### 3.3 Layout

- **With art:** Two-column. Left: commander art panel (380px wide, 316×434 card frame, rounded, shadow). Right: text stack (ManaTap, ROAST MY DECK, commander name, heat badge, excerpt, footer).
- **Without art:** Unchanged one-column text-only layout.

### 3.4 Fallbacks preserved

Roast missing → FallbackImage. Roast found but no art → text-only image. Any throw → FallbackImage.

### 3.5 File touched

**Modified:** `frontend/app/roast/[id]/opengraph-image.tsx` only.
