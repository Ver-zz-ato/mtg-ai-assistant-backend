# How to Reduce OpenAI API Usage

Based on your usage dashboard showing **$9.73 spent** (4.2M tokens, 1,272 requests), here are actionable ways to reduce costs.

## Current Cost Breakdown

- **gpt-4o-mini**: $0.15/$0.60 per 1K tokens (input/output) - **3.3x cheaper**
- **gpt-5**: $0.50/$1.50 per 1K tokens (input/output) - **Used for complex analysis**

## Already Implemented ✅

- **Response caching for chat** – 1-hour cache for identical queries (message + system hash + format + commander).
- **Tightened complex analysis** – gpt-5 only when deck context OR 2+ complex keywords; simple patterns use gpt-4o-mini.
- **Budget cap enforcement** – `allowAIRequest()` is called before chat, chat/stream, and deck/analyze. Set `llm_budget` in DB to enable (see below).
- **Request deduplication** – `unified-llm-client` uses `deduplicatedFetch` to avoid duplicate in-flight requests (e.g. double-clicks).
- **Rate limiting** – Daily + per-minute limits for chat; daily limits for deck analyze.
- **Lower max tokens for simple chat** – Dynamic ceilings (Phase B): simple 192, complex 320, +deck bonus, cap 512 (non-stream); stream scales similarly with cap 2000.
- **Sentry** – 1% traces in dev, 10% in production.
- **LLM v2 context (Phase A)** – Always on. Chat and stream send a compact `DeckContextSummary` plus last 6 messages (with deck pastes redacted) instead of full decklist + long history when deck context exists. Linked decks: summary stored in DB by `(deck_id, deck_hash)`. Pasted decklists: summary cached in-memory (LRU + TTL). **Migrations:** run `037_deck_context_summary.sql` and `038_ai_usage_context_source.sql` before deploying. **Observe:** `ai_usage.context_source` = `linked_db` | `paste_ttl` | `raw_fallback`.
- **Phase B (two-stage + dynamic ceilings + stop sequences)** – **Two-stage:** For long-answer deck questions (analyze, improve, suggest, etc.), a mini model first produces a short outline (3–6 sections); the main model then writes the response following that outline. **Dynamic token ceilings:** Non-stream max completion tokens scale by complexity and deck size (base 192/320, +deck bonus, cap 512). Stream ceiling scales similarly (base 768/1536, cap 2000). **Stop sequences:** Filler phrases like "Let me know if you have…", "Feel free to ask if…" are cut via OpenAI `stop`. Config: `frontend/lib/ai/chat-generation-config.ts`.

## Quick Wins (Immediate Impact)

### 1. **Enable Budget Caps** 💰 (recommended)
Budget enforcement is **wired** but only active when `llm_budget` is set in the database.

**In Supabase SQL Editor**:
```sql
INSERT INTO app_config (key, value)
VALUES ('llm_budget', '{"daily_usd": 5.0, "weekly_usd": 20.0}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

Adjust `daily_usd` and `weekly_usd` to your comfort level. When exceeded, chat/stream and deck/analyze return 429. Cached chat responses still work.

**Impact**: Hard cap prevents runaway costs.

### 2. **Response Caching for Chat** 💾 ✅ (already in place)
Chat responses are cached for identical queries.

Implemented in `frontend/app/api/chat/route.ts`: cache key includes text, system prompt hash, format, commander; TTL 1 hour.

**Impact**: Identical queries won't hit the API again for 1 hour. Saves 20-40% of requests.

### 3. **Tighten Complex Analysis Detection** 🎯 ✅ (already in place)
Simple patterns (card lookups, quick questions) use `gpt-4o-mini`. gpt-5 only when deck context OR 2+ complex keywords. See `isSimpleQuery` / `isComplexAnalysis` in chat route.

**Impact**: Avoids using gpt-5 for simple queries (~60% cost saving when switched).

### 4. **Budget caps** – see **#1 (Enable Budget Caps)** above.

### 5. **Reduce Max Tokens for Simple Queries** 📉 ✅ (already in place)
Simple queries use 192 max tokens, complex 384. See `callOpenAI` in chat route.

## Medium-Term Optimizations

### 6. **Request Deduplication** 🔄 ✅ (already in place)
`unified-llm-client` uses `deduplicatedFetch` for all non-streaming OpenAI calls (chat, deck analyze, etc.).

**Impact**: Prevents duplicate simultaneous requests (e.g. double-clicks).

### 7. **Optimize System Prompts** ✂️
Shorter system prompts = fewer input tokens.

**File**: `frontend/app/api/chat/route.ts`

Review system prompts and:
- Remove redundant instructions
- Use abbreviations where clear
- Remove examples if not critical

**Impact**: 10-20% reduction in input tokens.

### 8. **Rate Limiting Per User** ⏱️ ✅ (already in place)
Chat has durable daily limits and 10 requests/minute per user. Deck analyze has daily limits per user/guest/IP.

**Impact**: Prevents abuse and reduces unnecessary API calls.

## Long-Term Optimizations

### 9. **Implement Streaming Responses** 🌊
Stream responses to reduce perceived latency, allowing lower `max_tokens`.

**Impact**: Users get faster responses, can reduce `max_tokens` by 20-30%.

### 10. **Add Query Classification** 🏷️
Pre-classify queries before sending to API:
- Simple questions → gpt-4o-mini, 128 tokens
- Card lookups → gpt-4o-mini, 64 tokens  
- Deck analysis → gpt-5, 384 tokens

**Impact**: More precise model/token selection = 40-50% cost reduction.

## Monitoring

### Check Current Usage
```sql
-- Daily spend
SELECT 
  DATE(created_at) as date,
  SUM(cost_usd) as daily_cost,
  SUM(input_tokens) as input_tokens,
  SUM(output_tokens) as output_tokens,
  COUNT(*) as requests
FROM ai_usage
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Model breakdown
SELECT 
  model,
  COUNT(*) as requests,
  SUM(cost_usd) as total_cost,
  AVG(cost_usd) as avg_cost_per_request
FROM ai_usage
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY model
ORDER BY total_cost DESC;
```

### Set Up Alerts
Add to your monitoring:
- Alert if daily spend > $2
- Alert if gpt-5 usage > 50% of requests
- Alert if request count spikes > 200/day

## Expected Savings

Implementing items 1-5 should reduce costs by **40-60%**:
- Response caching: -20-40% requests
- Better model routing: -30-50% cost per request
- Reduced tokens: -10-20% output costs
- Budget caps: Prevents runaway costs

**Target**: Reduce from $9.73 to **$3-5/month** with these changes.

## Priority Order (what to do next)

1. **Enable budget caps** – Run the SQL in **#1** to set `llm_budget` (e.g. daily $5, weekly $20). Enforcement is already wired.
2. **#7 (Optimize System Prompts)** – Shorten prompts to cut input tokens 10–20%.
3. **#9 (Streaming)** – You have `/api/chat/stream`; ensure the main chat UI uses it where possible for better UX and potential token savings.
4. **#10 (Query classification)** – Pre-classify simple vs complex for even finer model/token choice.
