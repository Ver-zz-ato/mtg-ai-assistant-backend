# ManaTap AI Architecture — Industry Comparison & Design

How ManaTap's AI setup compares to ChatGPT-style best practices (routing, context, gating, caching, output length, multi-model orchestration), with corrections and Supabase-backed cache design.

---

## 1. Model Routing & Multi-Model Orchestration

### ChatGPT-style best practice
- Route simple queries to cheaper models (e.g. gpt-4o-mini)
- Route complex analysis to stronger models (e.g. gpt-4o)
- Tier-based access: free vs paid tiers get different model quality

### ManaTap implementation

**Current (implemented):** Per-tier model routing (`frontend/lib/ai/model-by-tier.ts`):

| Tier | Chat model (default) | Deck analysis model | Env vars |
|------|----------------------|---------------------|----------|
| **Guest** | gpt-4o-mini | — | `MODEL_GUEST` |
| **Free** | gpt-4o | — | `MODEL_FREE` |
| **Pro** | gpt-4o | gpt-4o | `MODEL_PRO_CHAT`, `MODEL_PRO_DECK` |

- **Guest** always uses mini (cheapest).
- **Free** and **Pro** use gpt-4o for complex queries; both fall back to gpt-4o-mini on capability errors.
- **Simple vs complex routing** (within each tier): simple queries (card lookups, quick rules) → mini; complex (deck analysis, synergy, 2+ complex keywords) → tier model.
- **Feature-specific models**: deck scan, swap-suggestions, swap-why, reprint-risk, deck compare, suggestion-why, deck analyze slots → all use gpt-4o-mini by default (env overridable).

**Admin model config:** `GET /api/admin/ai/model-config` shows effective env values.

**Verify:** Log model selected, gate mode result, and input tokens (rough). Use as audit checklist—heuristics can drift.

---

## 2. Context Management (Deck & Conversation)

### ChatGPT-style best practice
- Compact context for long conversations
- Summarize or truncate history to stay within token limits

### ManaTap implementation

**Current (implemented):**

- **LLM v2 context** (`llm_v2_context: true`): deck context sent as compact `DeckContextSummary` JSON (land_count, curve, ramp/removal/draw counts, archetype_tags, card_names) instead of full decklist.
- **Linked decks:** summary stored in `deck_context_summary` by `(deck_id, deck_hash)`.
- **Pasted decks:** in-memory LRU + 4h TTL keyed by deck_hash.
- **Conversation:** last 6 turns with deck-paste blocks redacted to "(decklist provided; summarized)".
- **Simple query trim:** deck context for simple questions limited to ~50 card names to reduce tokens.

**Planned / recommended:** Keep shrinking `card_names`. Current "50 card names" for simple queries is still a lot across 6 turns. Cheaper pattern: send counts + tags by default; send only a small "top-K relevant cards" chosen deterministically by query intent (e.g. ramp question → ramp package list; removal question → removal list). Context retrieval without full embeddings.

---

## 3. Gating (Layer 0)

### ChatGPT-style best practice
- Cheap classifiers or rules before expensive LLM calls
- FAQ shortcuts, off-topic detection

### ManaTap implementation

**Current (implemented):** Layer 0 (`frontend/lib/ai/layer0-gate.ts`)

**Precedence (explicit):**

| `LLM_LAYER0` env | Result |
|------------------|--------|
| `off` | Always off |
| `on` | Always on |
| unset | Follow `app_config.flags.llm_layer0` |

Your health endpoint shows `"llm_layer0": true` → Layer 0 is **on** in your setup when env is `on` or app_config has it true (and env is unset).

**Modes:**
- **NO_LLM:** Deterministic response, no API call. Handlers: `need_more_info` (empty input or "needs deck but none provided"), `static_faq` (answer from local FAQ map).
- **MINI_ONLY:** Single call to gpt-4o-mini with tight token ceiling. Used for simple rules/term questions, one-liners without deck, or near budget cap.
- **FULL_LLM:** Full flow including two-stage when applicable.

---

## 4. Caching

### ChatGPT-style best practice
- Cache identical or near-identical queries to avoid redundant API calls
- Persistent cache survives restarts and scales across instances

### ManaTap implementation

**Current (implemented):** Supabase-backed two-tier cache (`frontend/db/migrations/051_ai_response_cache.sql`, `frontend/lib/utils/supabase-cache.ts`, `frontend/lib/ai/cache-allowlist.ts`).

**Two-tier design:**

- **`ai_public_cache`** — Only for allowlisted intents with **no deck context** and **no chat history**. Key excludes user scope. Best ROI, safe.
- **`ai_private_cache`** — Everything else. Key includes scope: `user_id` → `guest:token_hash` → `anon:session_cookie` → `ip_hash` (last resort only). Avoid `ip_hash` when possible (mobile networks, NAT, VPNs can cause unwanted sharing).

**Precise definitions** (enforceable rules):

- **Deck context present** = any deck-derived fields included (even archetype_tags or a handful of card names).
- **Chat history present** = any prior turns beyond the current user message.

**Public cache allowlist** (brutally strict):

- MTG rules definitions ("what is affinity")
- Terminology ("what is mana value")
- Generic "how does X work" device-agnostic explanations
- Static FAQ answers
- Format legality basics
- Hard deny if message contains context-implying phrases ("my deck", "I said earlier", "you mentioned", etc.)

**Cache key:** SHA-256 hash of canonical payload (stable JSON key sort)—never store raw prompts. Payload includes `cache_version: 1`, `model`, `sysPromptHash`, `intent`, `normalized_user_text`, `deck_context_included`, `deck_hash`, `tier`, `locale`, and `scope` for private.

**Wiring:**

- **Chat route:** Cache read before LLM; cache write after successful response. 3h TTL. `recordAiUsage` with `cache_hit: true`, `cache_kind: 'public'|'private'` when serving from cache.
- **Stream route:** No cache read (streaming + cache hit = messy UX). Cache write on completion only.

**Security:** Server-only (service role); RLS enabled; no client access. Bounded lazy cleanup (up to 100 expired rows per write).

**Stale-while-revalidate (optional, later):** For `ai_public_cache` only—serve slightly stale, kick off background refresh. Not yet implemented.

---

## 5. Output Length & Token Ceilings

### ChatGPT-style best practice
- Dynamic max tokens by request type
- Stop sequences to trim filler

### ManaTap implementation

**Current (implemented):**

- **Dynamic ceilings** (`chat-generation-config.ts`): simple 192/320, complex 320/512 non-stream; stream 768/1536, cap 2000.
- **Stop sequences:** Filler phrases ("Let me know if…", "Feel free to ask…") cut via OpenAI `stop`.
- **Deck analyze:** Cap 1500 tokens; deck text truncated at 30k chars.

**Caveat:** `stop` can amputate legitimate content (quoted text, examples). When streaming, truncation can happen mid-sentence and look broken. **Safer:** Prefer instruction-level suppression ("do not add closing filler") + post-processor that trims known outro lines only at end of response. **Stream-safe:** avoids mid-sentence truncation. Same savings, no random truncation.

---

## 6. Two-Stage Generation

### ChatGPT-style best practice
- Outline → full answer for long, structured responses

### ManaTap implementation

**Current (implemented):**

- **Trigger:** Complex analysis + deck context + long-answer request.
- **Planner:** Mini model produces 3–6 section outline (256 tokens).
- **Writer:** Main model writes following outline.
- **Budget-aware:** Planner skipped when daily usage ≥ 90%.

**Caveats:** Planner can increase cost when answer would have been short anyway, planner is too verbose, or writer repeats planner. **Best practice:** Use two-stage only when predicted output > N tokens (e.g. 350), complexity high, deck context present. Keep planner output extremely tight (bullet outline, no prose).

**Define "predicted output":** Heuristic based on intent type + presence of deck context + user request (e.g. "give me 10 swaps" → higher predicted length). Document the heuristic so it's not magical—no code needed.

**Measure:** Track when two-stage increases cost vs. single-shot.

---

## 7. Budget & Rate Limits

### ChatGPT-style best practice
- Hard caps to prevent runaway costs
- Per-tier limits for fairness

### ManaTap implementation

**Current (implemented):**

- **Budget caps:** `llm_budget` in `app_config` (daily_usd, weekly_usd). Enforcement via `allowAIRequest()`.
- **Per-tier limits:** `feature-limits.ts` — deck analyze (guest 5, free 20, pro 200), health scan (free 10, pro 50), swap-suggestions, etc.
- **Chat:** 10 req/min per user; daily limits.

---

## 8. Health & Observability

**Current (implemented):** Health endpoint `GET /api/admin/ai/health` (admin only)

Returns:
- `openai_key_configured`
- `runtime_flags`: llm_layer0, llm_v2_context, llm_two_stage, llm_stop_sequences, llm_dynamic_ceilings, etc.
- `eli5`: plain-English explanation of each flag
- `diagnosis`: actionable suggestions
- Optional `?probe=1`: live OpenAI ping

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| **Tier models** | ✅ but verify | Log: model selected, gate mode result, input tokens (rough). Audit checklist. |
| **Context** | ✅ but watch out | v2 summary; keep shrinking card_names |
| **Layer 0** | ✅ | Explicit precedence: env off/on/unset → app_config |
| **Cache** | ✅ implemented | Supabase two-tier (public + private); scoped by user/guest/anon/ip |
| **Output caps** | ✅ but watch out | Stop sequences can amputate; prefer instruction + post-process (stream-safe) |
| **Two-stage** | ✅ but measure | Can backfire; use only when predicted > N tokens; define heuristic |
| **Budget** | ✅ | Daily/weekly caps, per-tier limits |

---

## Next Steps

1. **Optional:** Stale-while-revalidate for `ai_public_cache` only.
2. **Optional:** Deck analysis cache, static MTG FAQ cache in DB.
