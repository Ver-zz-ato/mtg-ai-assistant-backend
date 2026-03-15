# Mobile QA checklist

Lightweight checklist for verifying mobile behavior after changes. Use with browser device toolbar or real devices.

---

## Viewport widths to verify

| Width | Notes |
|-------|--------|
| 320px | iPhone SE, narrowest common |
| 375px | iPhone 8 / SE 2 |
| 390px | iPhone 14 |
| 768px | Tablet / md breakpoint |

---

## Pages and flows to check

- **Homepage** — Hero, chat area, bottom tools nav
- **Header** — Hamburger, mobile menu (all links, Sign in / Sign out)
- **Chat** — Input, send, message list, prompt chips
- **My Decks** — List; open one deck
- **Deck detail** — Build Assistant sticky, Deck Analyzer panel, suggestion actions (Add / Dismiss / Why?)
- **Admin** — `/admin/datadashboard/suggestions` (tables, horizontal scroll)

---

## What to verify

- [ ] **No horizontal scroll** — Page and main content do not scroll sideways
- [ ] **No clipped primary actions** — Buttons and key links are fully visible and not cut off
- [ ] **Sticky UI** — Build Assistant bar does not cover important controls or content
- [ ] **Long text** — Truncates or wraps; no overflow from card names, titles, or labels
- [ ] **Mobile menu** — Scrolls cleanly when many items; no clipping at bottom
- [ ] **Touch targets** — Primary actions feel comfortably tappable (~40–44px where intended)
- [ ] **Panel behavior** — Deck detail side panels (e.g. Mana Curve) open/close correctly; no flash at 768px when `defaultHiddenOnMobile` reconciles
- [ ] **Chat input** — Stays visible and usable; no layout break when keyboard opens (especially iOS)
- [ ] **Chat content** — Long code blocks or URLs scroll or wrap; do not force full-width layout break

---

## Device-testing note

These items require real device or browser device-emulation confirmation. Static code inspection cannot fully guarantee behavior (e.g. keyboard overlay, touch accuracy, scroll bounce, safe areas).
