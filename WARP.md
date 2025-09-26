# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview
- Frontend: Next.js (App Router) located in frontend/. It includes UI, server actions, and API routes under frontend/app/api. Auth and persistence use Supabase. Chat threads/messages are stored via Supabase tables (chat_threads, chat_messages). The chat route calls OpenAI’s Responses API.
- Backend (Python/Flask): backend/app.py provides pricing and deck analysis endpoints (e.g., /api/collections/cost, /api/collections/cost-to-finish, /deckcheck) that consume Scryfall and Commander Spellbook APIs. CORS is enabled for development origins. Optional OpenAI usage is controlled by env vars.
- Backend (Node/Express): backend/index.js provides utilities like OCR (/api/ocr via Tesseract), Scryfall fetching, a session memory log, and a Chat-completions endpoint (/api/ask). Useful for OCR/game-session features.

Common commands
Frontend (Next.js)
- Install deps
  - cd frontend
  - npm install
- Run dev server
  - npm run dev
  - App serves at http://localhost:3000
- Build and start
  - npm run build
  - npm start
- Lint
  - npm run lint
- E2E tests (Playwright)
  - Run all: npm run test:e2e
  - Run a single test by title: npm run test:e2e -- -g "pattern"
  - Run a specific file: npx playwright test tests/smoke.spec.ts
  - Optional base URL: set PLAYWRIGHT_BASE_URL (defaults to http://localhost:3000)

Python backend (Flask)
- Install deps
  - pip install -r requirements.txt
- Run (dev)
  - python backend/app.py  # binds 0.0.0.0:5000
- Run (gunicorn)
  - gunicorn --chdir backend wsgi:app --bind 0.0.0.0:5000
- Quick API smoke tests
  - python backend/test_api.py  # local
  - python backend/test_api_deployed.py  # against deployed URL

Node backend (Express)
- Install deps
  - cd backend
  - npm install
  - If OCR/memory endpoints are missing deps, install: npm i multer node-fetch tesseract.js
- Run
  - npm start  # node index.js (port 5000)

High-level architecture and flow
- Chat flow (frontend)
  - UI: frontend/components/Chat.tsx renders chat, sends messages, and displays assistant replies. Decklist detection triggers an analysis call.
  - Client API helpers: frontend/lib/threads.ts provides listThreads, listMessages, postMessage, and thread management wrappers. These call Next.js API routes under /api/chat.
  - API routes: frontend/app/api/chat/* implement chat/threads/messages endpoints. The main chat handler is frontend/app/api/chat/route.ts:
    - Auth: Supabase (createClient().auth.getUser()). Requests require a logged-in user.
    - Threading: Creates or validates a thread (chat_threads), persists user and assistant messages (chat_messages).
    - OpenAI: Calls POST https://api.openai.com/v1/responses with model from OPENAI_MODEL (default "gpt-5"). Parses output via a robust firstOutputText() helper.
    - Rate limiting: Uses a per-user count of recent messages across the user’s threads.
- Domain APIs (frontend)
  - Numerous Next.js routes exist for decks, collections, health, etc. For example: /api/decks/*, /api/collections/*, /api/cards/search, and chat thread/message utilities under /api/chat/*.
  - next.config.ts configures image allowlist for Scryfall and rewrites for PostHog ingest endpoints; eslint errors are ignored during builds, TypeScript errors are not.
- Python service responsibilities
  - Pricing and cost-to-finish: /api/collections/cost (alias at /api/collections/cost-to-finish) computes missing card costs using Scryfall prices. Accepts deck_text (or deckText) and an owned map.
  - Deck check: /deckcheck summarizes mana curve, color identity, types, and Commander legality; also fetches combos from Commander Spellbook.
  - OpenAI echo mode: /api returns an echo reply unless USE_OPENAI and OPENAI_API_KEY are set.
- Node service responsibilities
  - OCR: /api/ocr extracts a probable card name from an uploaded image using Tesseract.
  - Scryfall lookup: /api/scryfall/:name fetches card data.
  - Memory log: /api/memory (POST/GET/reset) for session-scoped events (e.g., zone tags).
  - Chat completions: /api/ask uses OpenAI Chat Completions (model gpt-4-turbo) with memory injected into the system prompt.

Notable files
- Frontend
  - app/api/chat/route.ts — canonical chat handler integrating Supabase + OpenAI Responses API
  - lib/threads.ts — typed client helpers for chat threads/messages
  - components/Chat.tsx — chat UI, decklist detection + analysis handoff
  - next.config.ts — image domains, rewrites, lint/TS behavior
  - playwright.config.ts — smoke test selection, baseURL
- Backend
  - backend/app.py — Flask app (pricing, deck check, Scryfall/Spellbook integration)
  - backend/index.js — Express app (OCR, memory, Scryfall, OpenAI chat)
  - backend/wsgi.py — Gunicorn entry

Environment variables referenced in code
- OPENAI_API_KEY — required for OpenAI calls (frontend chat route and backends)
- OPENAI_MODEL — optional; frontend chat route default is "gpt-5"
- PLAYWRIGHT_BASE_URL — optional; Playwright base URL for E2E
- CORS_ORIGINS — Python backend CORS allowlist (comma-separated)
- USE_OPENAI, MODEL, OPENAI_TEMPERATURE, MAXTOK — Python backend OpenAI toggles/params

Notes
- The frontend implements most application APIs inside Next.js routes under frontend/app/api. The separate backend services are complementary (OCR/memory; pricing/analysis) and can be run alongside the frontend during development.
- If you add or change chat behavior, update both client helpers (lib/threads.ts) and the server routes under app/api/chat/* to keep envelopes and shapes aligned.
