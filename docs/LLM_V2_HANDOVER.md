# LLM Cost Architecture v2 — Handover

Crisp, testable summary of what changed, why, and where. Use this for onboarding and ops.

---

## Phase A (Context Summary)

**Goal:** Reduce token spend by sending a compact deck context summary instead of full decklists and long chat history when a deck is linked or pasted.

**Implemented:**

- **Deck hash:** Parse decklist → normalize card names → sort entries by name → SHA256 hash. Stable across ordering; avoids raw-line sorting so headings/commander blocks don't affect the hash.
- **DeckContextSummary (JSON):** land_count, curve_histogram, ramp/removal/draw/board_wipes counts, archetype_tags, warning_flags, card_names, card_count, deck_hash.
- **Storage:**
  - **Linked decks:** Persist one row per (deck_id, deck_hash) in deck_context_summary. Reused until list changes.
  - **Pasted decks:** Best-effort in-memory LRU + 4h TTL keyed by deck_hash (not shared across instances).
- **Routes:**
  - **Chat + Stream:** If deck context exists (linked or pasted), prompts include:
    - DeckContextSummary JSON
    - Instruction: "Do not suggest cards listed in DeckContextSummary.card_names"
    - Last 6 turns, with detected deck-paste blocks replaced by "(decklist provided; summarized)"
  - No full decklist / no long history included.
  - **Deck analyze:** Supports optional deckId in body. When present, loads deck and get-or-builds summary (stored for chat reuse). **Analyze still uses full deck context** — accuracy matters most there; Phase A goal is mainly chat cost.
- **Instrumentation:** ai_usage logs: context_source (linked_db | paste_ttl | raw_fallback), summary_tokens_estimate, deck_hash.
- **Migrations:** 037_deck_context_summary.sql (table), 038_ai_usage_context_source.sql (three new columns).

**Key files:** lib/deck/deck-context-summary.ts (builder + paste cache), chat/stream/deck-analyze routes, lib/ai/log-usage.ts, docs/REDUCE_API_USAGE_GUIDE.md.

---

## Phase B (Generation Efficiency)

**Goal:** Reduce output token waste without reducing quality.

**Implemented:**

- **Two-stage generation (planner → writer)**
  - **Trigger:** isComplexAnalysis && hasDeckContext && isLongAnswerRequest(text)
  - **Planner:** Mini model produces a strict 3–6 section outline (OUTLINE_MAX_TOKENS=256).
  - **Writer:** Main model writes response strictly following outline (non-stream only).
  - **Budget-aware:** Planner stage is skipped when daily_usage_pct >= 90 (near cap).
- **Dynamic token ceilings**
  - **Module:** frontend/lib/ai/chat-generation-config.ts
  - **Non-stream:** base 192 (simple) / 320 (complex) + deck bonus, cap 512
  - **Stream:** base 768 (simple) / 1536 (complex) + deck bonus, cap 2000 (bounded by existing stream max)
  - Used by both chat and stream routes.
- **Stop sequences**
  - CHAT_STOP_SEQUENCES defined in config module (long, specific phrases to avoid cutting mid-sentence when streaming).
  - unified-llm-client now accepts stop?: string[] and passes through to OpenAI request.
  - Applied to chat, stream primary, stream fallback, and stream repair calls.

**Files touched:** New: frontend/lib/ai/chat-generation-config.ts. Updated: frontend/lib/ai/unified-llm-client.ts, chat + stream routes, docs/REDUCE_API_USAGE_GUIDE.md.

---

## Operational caveats

- **Phase A kill-switch:** Set `LLM_V2_CONTEXT=off` to force the raw path (full decklist, no summary). Use if a bad summary or prompt regression appears; avoids hotfix deploy as the only escape hatch.
- **Analyze uses full context on purpose:** Analyze is where accuracy matters most; Phase A targets chat cost. Don’t expect analyze spend to drop from v2 context.
- **Card name normalization:** Hash and summary use the same parser as deck/analyze: parseDeckText (handles "1x", "1 ", comments) and normalizeCardName (strip punctuation, whitespace). Split cards and "(SET)" are normalized consistently; if you add new deck formats, keep canonicalization in sync.
- **Summary prompt:** The model is told "Do NOT suggest cards listed in DeckContextSummary.card_names" — the list lives only in the JSON, not duplicated in the prompt.
- **Two-stage:** If the outline call fails or times out, the main call still runs without an outline. Planner is also skipped when near daily budget cap (≥90%).
- **Stop sequences:** Kept long and specific (e.g. "If you have any questions, feel free to ask.") so streaming doesn’t cut mid-sentence. Avoid adding short phrases like "Let me know" alone.
- **Dynamic ceilings:** Config module is the right place to add a tier-based clamp later (e.g. pro gets longer analysis).

---

## Layer 0 (Deterministic / Mini-only gate)

**Goal:** Reduce OpenAI spend by avoiding unnecessary LLM calls (NO_LLM) or using the cheap model only (MINI_ONLY) when the request is simple or deterministic.

**Feature flag:** `LLM_LAYER0=on` enables Layer 0. Default is off; when off, behavior is unchanged.

**Modes:**

- **NO_LLM:** Deterministic response — no API call. Handlers: `need_more_info` (empty input or “needs deck but none provided”), `static_faq` (answer from local FAQ map).
- **MINI_ONLY:** Single call to the cheap model (e.g. gpt-4o-mini) with a tight token ceiling. No two-stage planner. Used for simple rules/term questions, simple one-liners without deck, or when near budget cap (unless the request clearly needs FULL_LLM).
- **FULL_LLM:** Existing behavior (including Phase B two-stage when applicable).

**Where it runs:**

- **Chat (non-stream):** After auth and deck context resolution; before v2 summary build. NO_LLM returns same API shape; MINI_ONLY forces model + ceiling and skips planner.
- **Chat stream:** After v2 summary; NO_LLM returns a minimal SSE stream (one message then close); MINI_ONLY overrides model and token limit.
- **Deck analyze:** If no deckText and no deckId, returns NO_LLM need_more_info (400 + message to provide deck).

**Instrumentation:** `ai_usage` has nullable `layer0_mode` (`NO_LLM` | `MINI_ONLY` | `FULL_LLM`) and `layer0_reason`. Migration: `039_ai_usage_layer0.sql`.

**How to toggle:** Set `LLM_LAYER0=on` in env to enable; omit or set to anything else to leave existing behavior. `LLM_V2_CONTEXT` is unchanged (Phase A kill-switch).

**How to see layer0_mode distribution:**

```sql
SELECT layer0_mode, layer0_reason, COUNT(*), SUM(cost_usd)
FROM ai_usage
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY layer0_mode, layer0_reason
ORDER BY COUNT(*) DESC;
```

**Known limitations:** Classification is heuristic and keyword-based (no embeddings). Keep rules minimal; extend static FAQ and predicates in `frontend/lib/ai/layer0-gate.ts` and `frontend/lib/ai/static-faq.ts` as needed.

**Key files:** frontend/lib/ai/layer0-gate.ts, frontend/lib/ai/static-faq.ts, chat/stream/deck-analyze routes, frontend/lib/ai/log-usage.ts, frontend/db/migrations/039_ai_usage_layer0.sql, tests/unit/layer0-gate.test.ts.
