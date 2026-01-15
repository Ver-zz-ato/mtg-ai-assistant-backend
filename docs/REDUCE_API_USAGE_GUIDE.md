# How to Reduce OpenAI API Usage

Based on your usage dashboard showing **$9.73 spent** (4.2M tokens, 1,272 requests), here are actionable ways to reduce costs:

## Current Cost Breakdown

- **gpt-4o-mini**: $0.15/$0.60 per 1K tokens (input/output) - **3.3x cheaper**
- **gpt-5**: $0.50/$1.50 per 1K tokens (input/output) - **Used for complex analysis**

## Quick Wins (Immediate Impact)

### 1. **Reduce Sentry Sampling in Development** ⚡
Your Sentry config is set to **100% traces in dev**, which can be expensive.

**File**: `frontend/sentry.server.config.ts` and `frontend/instrumentation-client.ts`

```typescript
// Change from:
tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,

// To:
tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.01, // 1% in dev
```

**Impact**: Reduces Sentry overhead during development/testing.

### 2. **Add Response Caching for Chat** 💾
Currently, chat responses aren't cached. Add caching for identical queries.

**File**: `frontend/app/api/chat/route.ts`

Add after line 252 (in POST handler):
```typescript
// Cache key: user message + system prompt + format
const cacheKey = `chat:${text}:${sysPrompt?.slice(0, 100)}:${prefs?.format || ''}`;
const cached = memoGet<{ text: string; usage: any }>(cacheKey);
if (cached) {
  // Return cached response (skip API call)
  return ok({ text: cached.text, threadId: tid, provider: 'cached' });
}
```

Then after getting response (around line 1020):
```typescript
// Cache successful responses for 1 hour
if (outText) {
  memoSet(cacheKey, { text: outText, usage }, 60 * 60 * 1000);
}
```

**Impact**: Identical queries won't hit the API again for 1 hour. Could save 20-40% of requests.

### 3. **Tighten Complex Analysis Detection** 🎯
Make sure simple queries use `gpt-4o-mini` instead of `gpt-5`.

**File**: `frontend/app/api/chat/route.ts` (around line 896)

Current logic detects complex analysis. Review and ensure:
- Simple questions → `gpt-4o-mini` (cheaper)
- Only full deck analysis → `gpt-5` (expensive)

**Check**: Are too many queries being classified as "complex"? If yes, tighten the detection.

**Impact**: If 50% of queries are using gpt-5 instead of gpt-4o-mini, switching them saves ~60% cost.

### 4. **Enable Budget Caps** 💰
You have budget cap infrastructure but need to configure it.

**In Supabase SQL Editor**:
```sql
INSERT INTO app_config (key, value) 
VALUES ('llm_budget', '{"daily_usd": 1.0, "weekly_usd": 5.0}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

This will:
- Stop API calls if daily spend exceeds $1
- Stop API calls if weekly spend exceeds $5
- Return 429 error when budget exceeded

**Impact**: Hard cap prevents runaway costs.

### 5. **Reduce Max Tokens for Simple Queries** 📉
For simple queries using `gpt-4o-mini`, reduce `max_tokens`.

**File**: `frontend/app/api/chat/route.ts` (line 183)

```typescript
// Current: 384 tokens for all queries
let attempt = await invoke(baseModel, 384);

// Change to: Lower tokens for simple queries
const maxTokens = useMidTier ? 384 : 256; // 256 for simple, 384 for complex
let attempt = await invoke(baseModel, maxTokens);
```

**Impact**: Reduces output token costs by ~30% for simple queries.

## Medium-Term Optimizations

### 6. **Add Request Deduplication** 🔄
You have `deduplicatedFetch` but it's not used for chat API calls.

**File**: `frontend/app/api/chat/route.ts`

Wrap the OpenAI fetch call:
```typescript
import { deduplicatedFetch } from '@/lib/api/deduplicator';

// In invoke function, replace fetch with:
const res = await deduplicatedFetch(OPENAI_URL, {
  method: "POST",
  headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
  body: JSON.stringify(body),
});
```

**Impact**: Prevents duplicate simultaneous requests (common with double-clicks).

### 7. **Optimize System Prompts** ✂️
Shorter system prompts = fewer input tokens.

**File**: `frontend/app/api/chat/route.ts`

Review system prompts and:
- Remove redundant instructions
- Use abbreviations where clear
- Remove examples if not critical

**Impact**: 10-20% reduction in input tokens.

### 8. **Add Rate Limiting Per User** ⏱️
Prevent users from spamming requests.

**File**: `frontend/app/api/chat/route.ts`

Add after line 252:
```typescript
// Rate limit: 10 requests per minute per user
const rateLimitKey = `chat:${userId || req.ip}`;
const { success } = await checkDurableRateLimit(supabase, rateLimitKey, '/api/chat', 10, 1/60); // 10 per minute
if (!success) {
  return err('rate_limit', 'Too many requests. Please wait a moment.', 429);
}
```

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

## Priority Order

1. **#2 (Response Caching)** - Biggest impact, easy to implement
2. **#3 (Tighten Complex Detection)** - Review current logic
3. **#4 (Budget Caps)** - Safety net
4. **#5 (Reduce Max Tokens)** - Quick win
5. **#1 (Sentry Sampling)** - Reduce dev overhead
