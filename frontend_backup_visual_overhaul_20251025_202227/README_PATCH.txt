Drop these files into your repo, keeping the same paths (rooted at /frontend).
- components/HistoryDropdown.tsx: fixes auth guard + stable fetch + higher z-index so it's clickable
- lib/threads.ts: points to the real API routes (/api/chat/threads/list, /api/chat/messages/list, etc.)
- components/PosthogInit.tsx & components/Providers.tsx: disables the PostHog toolbar so it stops blocking clicks
- styles/ph-toolbar-fix.css: belt-and-braces CSS to hide any leftover toolbar overlay

After copying, import the CSS once (e.g. in app/layout.tsx or globals.css):
  import '@/styles/ph-toolbar-fix.css'

If you still see a crash from Chat.tsx like "Cannot read properties of undefined (reading 'length')",
add exactly one line near where `messages` is used:

  const safeMessages = Array.isArray(messages) ? messages : [];

And then use `safeMessages` instead of `messages` for `.length` and `.map()`.
