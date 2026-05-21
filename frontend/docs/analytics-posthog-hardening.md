# Analytics PostHog Hardening

## Why this exists

ManaTap analytics must never send raw chat text, decklists, collection payloads, emails, or raw thread identifiers to PostHog.

The 7-day audit found one historical bad `chat_sent` event on `2026-05-15` containing `user_message`, `assistant_message`, and `thread_id`, plus schema drift that still allowed those keys to appear.

## Code guardrail

Website/frontend capture now sanitizes every PostHog payload before capture in:

- `frontend/lib/analytics/sanitize.ts`
- `frontend/lib/ph.ts`
- `frontend/lib/server/analytics.ts`

Blocked exact keys:

- `email`
- `user_email`
- `thread_id`
- `user_message`
- `assistant_message`
- `prompt`
- `completion`
- `decklist`
- `collection`
- `collection_payload`
- `raw_collection`
- `raw_collection_payload`
- `cards`
- `card_list`
- `deck_text`
- `deckText`
- `messages`
- `request_body`
- `response_body`

Blocked high-risk key patterns:

- any key containing `email`
- any key containing `message`
- any key containing `prompt`
- any key containing `completion`
- any key containing `decklist`
- any key containing `collection`
- any key containing `thread_id`

Allowed safe replacements include:

- `user_message_present`
- `assistant_message_present`
- `thread_id_present`
- `message_length`
- `response_length`
- `deck_card_count`
- `collection_count`
- `has_collection`
- `has_deck_context`
- `prompt_version`
- `prompt_version_id`
- `prompt_path`

## PostHog ingestion transform

Keep the code sanitizer, but also block these keys at ingestion so schema drift cannot reintroduce them.

Recommended Data Pipeline / transform policy:

1. Drop event properties whose key lowercased exactly matches:
   - `email`, `user_email`, `thread_id`, `user_message`, `assistant_message`, `prompt`, `completion`, `decklist`, `collection`, `collection_payload`, `raw_collection`, `raw_collection_payload`, `cards`, `card_list`, `deck_text`, `decktext`, `messages`, `request_body`, `response_body`
2. Drop event properties whose key lowercased contains:
   - `email`, `message`, `prompt`, `completion`, `decklist`, `collection`, `thread_id`
3. Preserve safe boolean/count replacements:
   - keys ending in `_present`
   - `message_length`, `response_length`, `deck_card_count`, `collection_count`, `result_count`
4. Do not rewrite `session_id`, `feature`, `model`, `provider`, `route`, `latency_ms`, `input_tokens`, `output_tokens`, `total_tokens`, `estimated_cost_usd`, or `cache_hit`.

If your PostHog workspace uses SQL/JS transforms, implement the logic above before storage, not only in dashboards.

## Manual PostHog cleanup still required

Code should not attempt destructive PostHog cleanup.

Manual step:

- Delete the single historical bad `chat_sent` event from `2026-05-15` containing `user_message`, `assistant_message`, and `thread_id`.

## Session linkage

Server-side analytics now resolves session context in this order:

1. `X-Analytics-Session-Id`
2. `X-Session-Id`
3. website `mt_session_id` cookie
4. request-scoped Next.js headers/cookies when available

Do not send raw thread ids, conversation ids, or deck ids as `session_id`.

## Verification queries

### 1. Forbidden key scan

```sql
SELECT
  event,
  count(*) AS events_with_forbidden_keys
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND (
    JSONHas(properties, 'email')
    OR JSONHas(properties, 'user_email')
    OR JSONHas(properties, 'thread_id')
    OR JSONHas(properties, 'user_message')
    OR JSONHas(properties, 'assistant_message')
    OR JSONHas(properties, 'prompt')
    OR JSONHas(properties, 'completion')
    OR JSONHas(properties, 'decklist')
    OR JSONHas(properties, 'collection')
    OR JSONHas(properties, 'collection_payload')
    OR JSONHas(properties, 'raw_collection')
    OR JSONHas(properties, 'raw_collection_payload')
    OR JSONHas(properties, 'cards')
    OR JSONHas(properties, 'card_list')
    OR JSONHas(properties, 'deck_text')
    OR JSONHas(properties, 'deckText')
    OR JSONHas(properties, 'messages')
    OR JSONHas(properties, 'request_body')
    OR JSONHas(properties, 'response_body')
  )
GROUP BY event
ORDER BY events_with_forbidden_keys DESC;
```

### 2. Session coverage

```sql
SELECT
  event,
  count() AS total,
  countIf(nullIf(toString(properties.session_id), '') IS NOT NULL) AS with_session_id,
  round(with_session_id * 100.0 / total, 1) AS coverage_pct
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND event IN (
    'chat_sent',
    'chat_response_received',
    'ai_call_started',
    'ai_call_completed',
    'ai_call_failed'
  )
GROUP BY event
ORDER BY event;
```

### 3. Target event counts

```sql
SELECT
  event,
  count() AS total
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND event IN (
    'pageview_server',
    'user_first_visit',
    'app_open',
    'session_started',
    'session_engaged',
    'chat_sent',
    'chat_response_received',
    'ai_call_started',
    'ai_call_completed',
    'ai_call_failed',
    'first_tool_used',
    'first_ai_chat',
    'first_mobile_app_open',
    'playstyle_quiz_started',
    'playstyle_quiz_completed',
    'budget_swaps_started',
    'budget_swaps_generated',
    'deck_compare_started',
    'deck_compare_completed',
    'life_counter_game_started',
    'life_counter_life_changed'
  )
GROUP BY event
ORDER BY total DESC, event ASC;
```

### 4. Mobile app_open enrichment

```sql
SELECT
  count() AS total,
  countIf(nullIf(toString(properties.session_id), '') IS NOT NULL) AS with_session_id,
  countIf(nullIf(toString(properties.app_version), '') IS NOT NULL) AS with_app_version,
  countIf(nullIf(toString(properties.build_profile), '') IS NOT NULL) AS with_build_profile,
  countIf(nullIf(toString(properties.os), '') IS NOT NULL) AS with_os,
  countIf(nullIf(toString(properties.device_type), '') IS NOT NULL) AS with_device_type
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND event = 'app_open';
```

### 5. AI telemetry completeness

```sql
SELECT
  event,
  countIf(nullIf(toString(properties.feature), '') IS NULL) AS missing_feature,
  countIf(nullIf(toString(properties.model), '') IS NULL) AS missing_model,
  countIf(nullIf(toString(properties.provider), '') IS NULL) AS missing_provider,
  countIf(nullIf(toString(properties.route), '') IS NULL) AS missing_route,
  countIf(properties.latency_ms IS NULL) AS missing_latency_ms,
  countIf(properties.cache_hit IS NULL) AS missing_cache_hit
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND event IN ('ai_call_started', 'ai_call_completed', 'ai_call_failed')
GROUP BY event
ORDER BY event;
```

### 6. Feature wrapper event counts

```sql
SELECT
  event,
  count() AS total
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND event IN (
    'playstyle_quiz_started',
    'playstyle_quiz_completed',
    'budget_swaps_started',
    'budget_swaps_generated',
    'deck_compare_started',
    'deck_compare_completed',
    'life_counter_game_started',
    'life_counter_life_changed'
  )
GROUP BY event
ORDER BY event;
```

### 7. UTM population

```sql
SELECT
  event,
  count() AS total,
  countIf(nullIf(toString(properties.utm_source), '') IS NOT NULL) AS with_utm_source,
  countIf(nullIf(toString(properties.utm_medium), '') IS NOT NULL) AS with_utm_medium,
  countIf(nullIf(toString(properties.utm_campaign), '') IS NOT NULL) AS with_utm_campaign,
  countIf(nullIf(toString(properties.utm_term), '') IS NOT NULL) AS with_utm_term,
  countIf(nullIf(toString(properties.utm_content), '') IS NOT NULL) AS with_utm_content
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND event IN ('pageview_server', 'user_first_visit', 'session_started', 'session_engaged')
GROUP BY event
ORDER BY event;
```

### 8. Duplicate detection

```sql
SELECT
  event,
  toStartOfSecond(timestamp) AS second_bucket,
  toString(properties.session_id) AS session_id,
  toString(properties.route_path) AS route_path,
  count() AS duplicates
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
  AND event IN ('pageview_server', 'ai_call_started')
GROUP BY event, second_bucket, session_id, route_path
HAVING duplicates > 1
ORDER BY duplicates DESC, second_bucket DESC
LIMIT 100;
```
