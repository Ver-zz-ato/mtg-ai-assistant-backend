# Homepage UI Layout — LLM Handover for Chat Cutoff Diagnosis

**Purpose:** Handover document for diagnosing the chat/conversation box cutoff issue on the ManaTap AI homepage. Use this to understand the current layout structure and identify layout conflicts.

---

## 1. Document Structure (Top to Bottom)

```
layout.tsx (root)
├── body (min-h-screen flex flex-col)
│   ├── GlobalBackground
│   ├── Providers
│   │   ├── PromoBar
│   │   ├── MaintenanceBanner
│   │   ├── Header (fixed or sticky nav)
│   │   ├── main (flex-1)  ← children go here
│   │   │   └── page.tsx
│   │   ├── TrustFooter
│   │   ├── SupportWidgets
│   │   └── ...
│   └── ...
```

---

## 2. Page Structure (`app/page.tsx`)

```
<div className="w-full relative">
  ├── TopToolsStrip (max-w-[1600px] mx-auto px-4 pt-0)
  ├── LivePresenceBanner (max-w-[1600px] mx-auto px-4 pt-2)
  ├── HomepageSignupBanner (conditional)
  ├── HomeVariantB (conditional, max-w-[1600px] mx-auto px-4 pt-4)
  │
  └── GRID: max-w-[1600px] mx-auto px-4 py-0 grid grid-cols-1 lg:grid-cols-12 gap-6
      ├── Left aside (hidden lg:block lg:col-span-2)
      │   ├── Shoutbox
      │   ├── MetaDeckPanel
      │   └── LeftSidebar
      │
      ├── Main section (col-span-1 lg:col-span-7 xl:col-span-7 flex flex-col gap-3 pt-2)  [data-chat-area]
      │   ├── AIMemoryGreeting (mb-3)
      │   └── Chat  ← THE CHAT COMPONENT
      │
      └── Right aside (col-span-1 lg:col-span-3 xl:col-span-3 order-last lg:order-none)
          └── RightSidebar (FAQ, Mulligan Simulator, Deck Snapshot, Custom Card Creator)
```

**Responsive behavior:**
- **Mobile (< lg):** `grid-cols-1` — single column, order: Main → Right (order-last on right)
- **Desktop (lg+):** 12-column grid, Left(2) | Main(7) | Right(3)

**Important:** The main section has `flex flex-col gap-3` but **no height constraint**. The Chat component controls its own height.

---

## 3. Chat Component Layout (`components/Chat.tsx`)

### 3.1 Outer Wrapper (line ~1204)

```tsx
<div className="min-h-[600px] xl:h-[calc(100dvh-80px)] flex flex-col bg-black text-white overflow-visible xl:overflow-hidden relative">
```

| Class | Purpose |
|-------|---------|
| `min-h-[600px]` | Minimum height on all screens (tiny screens, mobile) |
| `xl:h-[calc(100dvh-80px)]` | **Desktop (1280px+):** Fixed height = viewport minus ~80px (for header/promo) |
| `flex flex-col` | Vertical flex layout |
| `overflow-visible` | Mobile: allow content to extend, page scrolls |
| `xl:overflow-hidden` | Desktop: clip overflow, no page push |
| `relative` | Positioning context |

**Breakpoint:** `xl` = 1280px (Tailwind default)

---

### 3.2 Chat Internal Structure (vertical order)

```
Chat outer wrapper
├── 1. Header (flex-shrink-0)
│   └── "ManaTap AI" title, Guest Mode badge, progress bar
│   └── className: "relative p-4 sm:p-5 flex-shrink-0 overflow-hidden border-b border-neutral-700/80"
│
├── 2. Controls strip (flex-shrink-0)
│   └── Deck Mode, Format, Value, Colors, BuilderOverflowMenu
│   └── className: "p-2 sm:p-4 space-y-3 border-b border-neutral-800 flex-shrink-0"
│   └── Note: extrasOn expands this (Deck Mode, Format, Value, Colors) — variable height
│
├── 3. Messages wrapper (flex-1 min-h-0)
│   └── className: "flex-1 min-h-0 flex flex-col overflow-hidden"
│   └── Contains:
│       ├── fallbackBanner (optional, flex-shrink-0)
│       └── Scroll div (flex-1 min-h-0 overflow-y-auto)  ← ACTUAL SCROLL CONTAINER
│           └── Messages, empty state, streaming content
│
└── 4. Composer / Input area (flex-shrink-0)
    └── className: "p-3 sm:p-4 border-t border-neutral-800 bg-neutral-950 flex-shrink-0"
    └── Contains: prompt chips, model tier text, textarea, Send button
```

---

### 3.3 Messages Wrapper (line ~1387)

```tsx
<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
```

| Class | Purpose |
|-------|---------|
| `flex-1` | Take remaining vertical space |
| `min-h-0` | **Critical:** Allow flex child to shrink below content size |
| `overflow-hidden` | Clip overflow; scroll happens in child |

---

### 3.4 Scroll Div (line ~1392) — `messagesContainerRef`

```tsx
<div ref={messagesContainerRef} className="flex-1 min-h-0 flex flex-col space-y-3 bg-neutral-950 text-neutral-100 border border-neutral-800 rounded-lg p-4 overflow-y-auto overscroll-contain">
```

| Class | Purpose |
|-------|---------|
| `flex-1 min-h-0` | Fill messages wrapper, can shrink |
| `overflow-y-auto` | **Scrollbar appears here** when content overflows |
| `overscroll-contain` | Prevent scroll chaining to parent |
| `space-y-3` | Gap between messages |

---

### 3.5 Composer (Input Area) (line ~1540)

```tsx
<div className="p-3 sm:p-4 border-t border-neutral-800 bg-neutral-950 flex-shrink-0">
```

| Class | Purpose |
|-------|---------|
| `flex-shrink-0` | Never shrink; always visible at bottom |

---

## 4. Key Layout Recipe (ChatGPT/Cursor-style)

| Layer | Role | Classes |
|-------|------|---------|
| Outer wrapper | Fixed height on desktop | `xl:h-[calc(100dvh-80px)]` + `xl:overflow-hidden` |
| Header | Shrink 0 | `flex-shrink-0` |
| Controls | Shrink 0 | `flex-shrink-0` |
| Messages wrapper | Flex fill, can shrink | `flex-1 min-h-0` + `overflow-hidden` |
| Scroll div | **Only scroll container** | `flex-1 min-h-0` + `overflow-y-auto` |
| Composer | Shrink 0 | `flex-shrink-0` |

---

## 5. Known Variables That Affect Height

1. **Header above page:** PromoBar, MaintenanceBanner, Header — not inside Chat; the `80px` in `calc(100dvh-80px)` is an estimate for this.
2. **extrasOn:** When true, Controls strip shows Deck Mode, Format, Value, Colors — adds ~100–150px.
3. **Guest Mode progress bar:** Adds ~24px when guest has messages.
4. **fallbackBanner:** Optional yellow banner in messages wrapper.
5. **Viewport units:** `100dvh` = dynamic viewport height (accounts for mobile browser chrome). Falls back to `vh` in older browsers.

---

## 6. Potential Cutoff Causes to Check

1. **80px too small:** If Header + PromoBar + MaintenanceBanner > 80px, Chat is taller than viewport → bottom (composer) gets clipped.
2. **extrasOn height:** Controls strip height varies; on small desktop (e.g. 768px height), header + controls + composer might exceed remaining space.
3. **Parent section has no height:** `section` in page.tsx has `flex flex-col` but no `min-h-0` or `overflow`. If Chat is `min-h-[600px]` on mobile, section grows. On desktop, Chat has fixed height — section should size to Chat. Check if `flex flex-col` on section causes issues.
4. **Grid row height:** The grid in page.tsx doesn't constrain row height. Rows grow to content. Chat's fixed height on xl should constrain it — but the **section** wraps Chat. Section has `flex flex-col gap-3`. Does the section need `min-h-0` or `overflow-hidden`?
5. **100dvh support:** Older browsers may not support `dvh`; verify fallback.

---

## 7. File References

| File | Relevant Lines |
|------|----------------|
| `app/layout.tsx` | body: `min-h-screen flex flex-col`, main: `flex-1` |
| `app/page.tsx` | 93–111: grid, section, Chat placement |
| `components/Chat.tsx` | 1204: outer wrapper, 1387: messages wrapper, 1392: scroll div, 1540: composer |

---

## 8. Quick Diagnostic Checklist

- [ ] Measure actual Header + PromoBar + MaintenanceBanner height. Is 80px correct?
- [ ] On viewport 768px height: does `calc(100dvh-80px)` leave enough room for header + controls + composer?
- [ ] Does the page.tsx `section` need `min-h-0` or `overflow-hidden` to prevent flex issues?
- [ ] Is `100dvh` supported in target browsers? Consider `min(100dvh, 100vh)` fallback.
- [ ] When extrasOn is true, does controls strip push composer below fold on low-res desktop?
