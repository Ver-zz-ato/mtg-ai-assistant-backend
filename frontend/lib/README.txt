MTG AI Assistant — Chat AI payload + route hotfix (v2)
=====================================================

Fixes applied:
1. frontend/lib/threads.ts
   - postMessage now takes (content, threadId?) and sends { text, threadId }.
   - Matches ChatPostSchema used in /api/chat.

2. frontend/app/api/chat/messages/post/route.ts
   - Proxies to /api/chat (full model handler) instead of /messages/append.

How to apply:
- Unzip over your repo root, replacing the two files above.
- Delete .next/ and restart `npm run dev` (or `pnpm dev`).

Quick test:
- Start New thread, type "hello".
- POST /api/chat/messages/post should return { ok: true, threadId, text }.
- A new thread appears in History, assistant reply shows.
