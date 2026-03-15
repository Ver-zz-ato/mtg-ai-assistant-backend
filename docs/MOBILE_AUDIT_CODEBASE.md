# Mobile audit — codebase-first

**Scope:** Website (Next.js frontend in `mtg_ai_assistant/frontend`).  
**Goal:** Assess how well the site is set up to show on phones from layout, viewport, responsive patterns, and tables. No live device testing in this doc.

---

## 1. Viewport & meta

| Item | Status | Location |
|------|--------|----------|
| Viewport meta | OK | `app/layout.tsx`: `export const viewport = { width: 'device-width', initialScale: 1, maximumScale: 5, userScalable: true }` |
| Theme color | OK | `themeColor: '#2563eb'` |
| Apple web app | OK | `appleWebApp: { capable: true, statusBarStyle: 'default', title: 'ManaTap AI' }` |
| Manifest / icons | OK | Referenced in layout metadata |

**Verdict:** Mobile viewport and scaling are correctly configured; zoom is allowed.

---

## 2. Global layout

| Item | Status | Notes |
|------|--------|--------|
| Root layout | OK | `body`: `min-h-screen flex flex-col`; `main`: `flex-1` |
| Max width | OK | Key pages use `max-w-[1600px]` or `max-w-5xl` with `mx-auto px-4` (or `sm:px-6`, `lg:px-8`) |
| Horizontal overflow | Low risk | No `overflow-x: hidden` on body; narrow fixed widths could still cause overflow if present in components |

---

## 3. Header & navigation

| Item | Status | Notes |
|------|--------|--------|
| Desktop nav | OK | `hidden lg:flex` — nav links only at `lg` (1024px+) |
| Mobile nav | OK | `lg:hidden` hamburger; `mobileMenuOpen` state; full mobile menu with main links (Changelog, Commanders, Decks, Builder, Blog, Pricing, My Decks, Collections, Wishlist, Sign out / Sign up) |
| Logo on small screens | OK | `hidden sm:block` on "ManaTap AI" text — logo icon always; text from 640px up |
| Breakpoint | Note | Mobile menu at `< 1024px` (lg), not 768px — tablets in portrait see hamburger |
| Touch targets (nav) | Caution | Desktop links use `px-2 py-1`; mobile menu uses `py-2 px-2` — acceptable but not consistently 44px min |
| Auth modal | OK | Body scroll locked when open; full-screen overlay |

**Verdict:** Navigation is mobile-aware with a dedicated menu; breakpoint is lg, so “mobile” includes smaller tablets.

---

## 4. Homepage (`app/page.tsx`)

| Item | Status | Notes |
|------|--------|--------|
| Grid | OK | `grid-cols-1 md:grid-cols-12` — single column on small screens |
| Left sidebar | OK | `ResponsiveLeftSidebar`: renders nothing below 768px; content available via `CommunityDrawer` + `MobileOnlyContent` |
| Main chat | OK | `col-span-1 md:col-span-7` — full width on mobile |
| Right sidebar | OK | `col-span-1 md:col-span-3`, `order-last md:order-none` — stacks below on mobile |
| Community drawer | OK | Mobile-only content in a drawer; no duplicate sidebar on desktop |
| SEO/tools nav (bottom) | Caution | Many inline links with `·`; no `flex-wrap` or explicit wrapping — may wrap via default block/inline behavior; long lines on very narrow widths could be cramped. Consider `flex flex-wrap justify-center gap-x-2 gap-y-1` for more predictable wrapping |

**Verdict:** Homepage is responsive; only the bottom tools nav may need a small tweak for very narrow screens.

---

## 5. Deck detail (`app/my-decks/[id]/page.tsx`)

| Item | Status | Notes |
|------|--------|--------|
| Main grid | OK | `grid-cols-12`; main `col-span-12 md:col-span-9`, sidebar `col-span-12 md:col-span-3` — stacks on mobile |
| Padding | OK | `px-4 sm:px-6 lg:px-8 2xl:px-10 py-8` |
| Sidebar panels | OK | `PanelWrapper` with `defaultHiddenOnMobile` (e.g. Mana Curve) and `defaultCollapsed` to reduce vertical load on small screens |
| PanelWrapper init | Caution | Uses `window.innerWidth < 768` in initial state — can cause hydration mismatch if server renders “open” and client “closed”. Prefer a single source (e.g. always start collapsed when `defaultHiddenOnMobile` and set open after mount from media query |
| SVGs (pie/radar) | OK | `max-w-[240px]` / `max-w-[260px]`; scale down on narrow screens |

**Verdict:** Deck page is responsive; PanelWrapper’s mobile detection is the only subtle issue (hydration).

---

## 6. Data dashboard (e.g. suggestions, admin)

| Item | Status | Notes |
|------|--------|--------|
| Container | OK | `max-w-5xl mx-auto p-4` |
| Tables | OK | All tables wrapped in `overflow-x-auto` — horizontal scroll on small screens |
| KPI grids | OK | `grid-cols-2 sm:grid-cols-4 lg:grid-cols-7` — 2 columns on mobile |
| Typography | OK | `text-sm` / `text-xs` for tables; no fixed min-width on container |

**Verdict:** Dashboard and suggestions page are table-safe on narrow viewports.

---

## 7. Tables across the app

- **Suggestions dashboard:** All sections use `overflow-x-auto` around tables.
- **Deck metrics / meta-trends:** Same pattern.
- **Cost-to-finish / AI usage / SEO pages:** Use `overflow-x-auto` and/or `min-w-0` where needed.

No critical tables were found without a scroll container in user-facing or admin views.

---

## 8. Modals & overlays

| Component | Status | Notes |
|-----------|--------|--------|
| FeedbackFab | OK | `fixed bottom-4 left-4`; modal uses `items-end justify-center … sm:items-center` and `max-w-md` — bottom sheet–like on mobile |
| Cookie consent | OK | Typically full-width or centered; no fixed large width |
| OnboardingTour | OK | Uses `90vw` and viewport bounds for tooltip position; `isSmallScreen = viewportWidth < 768` |
| CardHoverPreview / ProValueTooltip | OK | Clamp to viewport so they don’t go off-screen |

---

## 9. Touch & interaction

| Item | Status | Notes |
|------|--------|--------|
| Touch-action / tap highlight | Not set | No global `-webkit-tap-highlight-color` or `touch-action` in globals.css — could add for consistency (e.g. reduce tap flash, avoid accidental zoom on double-tap if desired) |
| Button size | Mixed | Many actions use `px-2 py-1` or `text-xs`; 44×44px minimum not enforced everywhere. Mobile menu and FAB are adequately sized |
| Hover-only UX | Low risk | Ghost hand and some hover states don’t block core flows; touch users still get tap. No critical “hover only” actions found |

---

## 10. Typography & readability

| Item | Status | Notes |
|------|--------|--------|
| Base font | OK | No forced small base (e.g. 10px) on body |
| Very small text | Present | `text-[10px]`, `text-[11px]`, `text-xs` used in deck page (curve labels, type distribution), tables, and secondary UI. Acceptable for secondary info; avoid for long reading on mobile |
| Truncation | OK | `truncate` and `max-w-[…]` used where needed (e.g. long names, IDs) |

---

## 11. Components worth a quick manual check

- **Chat (`components/Chat.tsx`):** Large component; input and message list should be full-width on mobile — no obvious fixed widths in the sampled code; confirm on device.
- **DeckAnalyzerPanel:** Used in deck flow; ensure suggestion cards and actions don’t overflow on narrow screens.
- **BuildAssistantSticky:** Sticky bar on deck page — confirm it doesn’t cover too much content on short viewports.
- **HomepageSignupBanner / HomeVariantB:** CTA layout and stacking on 320–400px width.

---

## 12. Summary

| Area | Grade | Notes |
|------|--------|--------|
| Viewport / meta | A | Correct and zoom-friendly |
| Header / nav | A | Dedicated mobile menu at lg |
| Homepage | A- | Responsive grid and drawer; bottom nav could wrap more predictably |
| Deck detail | B+ | Responsive; PanelWrapper hydration nuance |
| Dashboards / tables | A | overflow-x-auto used consistently |
| Modals / FAB | A | Mobile-friendly positioning |
| Touch / targets | B | No major gaps; 44px not systematic |
| Typography | B+ | Some very small text; acceptable for secondary UI |

**Overall:** The codebase is in good shape for mobile: viewport is correct, layout is responsive with clear breakpoints (md/lg), tables scroll horizontally, and the header uses a proper mobile menu. The main follow-ups are: (1) optional small tweaks (homepage bottom nav wrapping, PanelWrapper hydration, tap highlight); (2) a short device pass on Chat, deck analyzer, and sticky bars to confirm no overflow or overlap on real phones.

---

## 13. Suggested next steps (optional)

1. **Live check:** Open `/`, `/my-decks`, one deck detail, and `/admin/datadashboard/suggestions` in Chrome DevTools device toolbar (e.g. iPhone SE, Pixel 5) and confirm no horizontal scroll and that key actions are tappable.
2. **Homepage footer nav:** Add `flex flex-wrap justify-center gap-x-2 gap-y-1` (or similar) to the tools/discovery nav so links wrap cleanly on very narrow screens.
3. **PanelWrapper:** Initialize `open` without `window` (e.g. always `false` when `defaultHiddenOnMobile`), then in `useEffect` set `true` when `matchMedia('(min-width: 768px)').matches` to avoid hydration mismatch.
4. **Touch polish:** In `globals.css`, consider `-webkit-tap-highlight-color: transparent` (or a brand color) and ensure no critical buttons are below 44px height on touch targets.
