# Dropoff Analytics Queries

SQL/HogQL queries to identify where users drop off and stop using ManaTap. Use in PostHog SQL/HogQL editor or Supabase SQL editor.

---

## 1) Signup → Activation Dropoff

**Question:** Of users who signed up, how many used chat or saved a deck within 24 hours?

### PostHog HogQL

```sql
-- Signup → Activation (24h)
WITH signups AS (
  SELECT 
    distinct_id,
    min(timestamp) AS signup_at
  FROM events
  WHERE event = 'signup_completed'
    AND timestamp >= now() - INTERVAL 90 DAY
  GROUP BY distinct_id
),
activations AS (
  SELECT 
    e.distinct_id,
    min(e.timestamp) AS first_activation_at
  FROM events e
  WHERE e.event IN ('chat_sent', 'deck_saved')
    AND e.timestamp >= now() - INTERVAL 90 DAY
  GROUP BY e.distinct_id
)
SELECT
  count(DISTINCT s.distinct_id) AS total_signups,
  count(DISTINCT CASE 
    WHEN a.first_activation_at IS NOT NULL 
     AND dateDiff('hour', s.signup_at, a.first_activation_at) <= 24 
    THEN s.distinct_id 
  END) AS activated_within_24h,
  round(100.0 * count(DISTINCT CASE 
    WHEN a.first_activation_at IS NOT NULL 
     AND dateDiff('hour', s.signup_at, a.first_activation_at) <= 24 
    THEN s.distinct_id 
  END) / nullIf(count(DISTINCT s.distinct_id), 0), 2) AS pct_activated_24h
FROM signups s
LEFT JOIN activations a ON s.distinct_id = a.distinct_id
```

**Interpretation:**
- **Low % activated (e.g. < 40%)** → Problem: users sign up but don’t experience core value quickly.
- **Action:** Improve onboarding, first-run prompts, or guided first chat/deck flow.

---

## 2) Activation → Repeat Usage

**Question:** Of users who activated once, how many came back 3+, 7+, or 14+ days later?

### PostHog HogQL

```sql
-- Activation → Repeat Usage (3d, 7d, 14d)
WITH first_activation AS (
  SELECT distinct_id, min(timestamp) AS first_at
  FROM events
  WHERE event IN ('chat_sent', 'deck_saved')
    AND timestamp >= now() - INTERVAL 90 DAY
  GROUP BY distinct_id
),
has_repeat_3d AS (
  SELECT DISTINCT fa.distinct_id
  FROM first_activation fa
  JOIN events e ON e.distinct_id = fa.distinct_id
    AND e.event IN ('chat_sent', 'deck_saved')
    AND e.timestamp > fa.first_at
    AND dateDiff('day', fa.first_at, e.timestamp) >= 3
  WHERE e.timestamp >= now() - INTERVAL 90 DAY
),
has_repeat_7d AS (
  SELECT DISTINCT fa.distinct_id
  FROM first_activation fa
  JOIN events e ON e.distinct_id = fa.distinct_id
    AND e.event IN ('chat_sent', 'deck_saved')
    AND e.timestamp > fa.first_at
    AND dateDiff('day', fa.first_at, e.timestamp) >= 7
  WHERE e.timestamp >= now() - INTERVAL 90 DAY
),
has_repeat_14d AS (
  SELECT DISTINCT fa.distinct_id
  FROM first_activation fa
  JOIN events e ON e.distinct_id = fa.distinct_id
    AND e.event IN ('chat_sent', 'deck_saved')
    AND e.timestamp > fa.first_at
    AND dateDiff('day', fa.first_at, e.timestamp) >= 14
  WHERE e.timestamp >= now() - INTERVAL 90 DAY
)
SELECT
  count(DISTINCT fa.distinct_id) AS total_activated,
  count(DISTINCT r3.distinct_id) AS repeat_3d,
  count(DISTINCT r7.distinct_id) AS repeat_7d,
  count(DISTINCT r14.distinct_id) AS repeat_14d,
  round(100.0 * count(DISTINCT r3.distinct_id) / nullIf(count(DISTINCT fa.distinct_id), 0), 2) AS pct_repeat_3d,
  round(100.0 * count(DISTINCT r7.distinct_id) / nullIf(count(DISTINCT fa.distinct_id), 0), 2) AS pct_repeat_7d,
  round(100.0 * count(DISTINCT r14.distinct_id) / nullIf(count(DISTINCT fa.distinct_id), 0), 2) AS pct_repeat_14d
FROM first_activation fa
LEFT JOIN has_repeat_3d r3 ON fa.distinct_id = r3.distinct_id
LEFT JOIN has_repeat_7d r7 ON fa.distinct_id = r7.distinct_id
LEFT JOIN has_repeat_14d r14 ON fa.distinct_id = r14.distinct_id
```

**Interpretation:**
- **Low 7d repeat (e.g. < 25%)** → Problem: users try once and don’t return.
- **Action:** Improve retention (email, notifications, habit-forming flows).

---

## 3) Login Without Activation

**Question:** Users who logged in but never chatted or saved a deck.

### PostHog HogQL

```sql
-- Login without activation
WITH logins AS (
  SELECT distinct_id
  FROM events
  WHERE event = 'login_completed'
    AND timestamp >= now() - INTERVAL 90 DAY
  GROUP BY distinct_id
),
activated AS (
  SELECT distinct_id
  FROM events
  WHERE event IN ('chat_sent', 'deck_saved')
    AND timestamp >= now() - INTERVAL 90 DAY
  GROUP BY distinct_id
)
SELECT
  count(DISTINCT l.distinct_id) AS total_logins,
  count(DISTINCT l.distinct_id) - count(DISTINCT a.distinct_id) AS login_never_activated,
  round(100.0 * (count(DISTINCT l.distinct_id) - count(DISTINCT a.distinct_id)) / nullIf(count(DISTINCT l.distinct_id), 0), 2) AS pct_never_activated
FROM logins l
LEFT JOIN activated a ON l.distinct_id = a.distinct_id
```

**Interpretation:**
- **High % never activated** → Problem: returning users don’t engage.
- **Action:** Improve re-onboarding, homepage clarity, or prompts to use chat/deck.

---

## 4) Pro Gate Friction

**Question:** Of users who saw the pro gate, how many upgraded? How many stopped all activity?

### PostHog HogQL

```sql
-- Pro gate funnel
WITH gate_viewers AS (
  SELECT distinct_id, min(timestamp) AS gate_at
  FROM events
  WHERE event = 'pro_gate_viewed'
    AND timestamp >= now() - INTERVAL 90 DAY
  GROUP BY distinct_id
),
upgraded AS (
  SELECT distinct_id
  FROM events
  WHERE event = 'pro_upgrade_completed'
    AND timestamp >= now() - INTERVAL 90 DAY
  GROUP BY distinct_id
),
last_activity AS (
  SELECT 
    distinct_id,
    max(timestamp) AS last_at
  FROM events
  WHERE event NOT IN ('pro_gate_viewed', '$pageview', 'app_open')
    AND timestamp >= now() - INTERVAL 90 DAY
  GROUP BY distinct_id
)
SELECT
  count(DISTINCT g.distinct_id) AS saw_gate,
  count(DISTINCT u.distinct_id) AS upgraded,
  round(100.0 * count(DISTINCT u.distinct_id) / nullIf(count(DISTINCT g.distinct_id), 0), 2) AS pct_upgraded,
  count(DISTINCT CASE 
    WHEN u.distinct_id IS NULL 
     AND (l.last_at IS NULL OR l.last_at <= g.gate_at)
    THEN g.distinct_id 
  END) AS stopped_after_gate,
  round(100.0 * count(DISTINCT CASE 
    WHEN u.distinct_id IS NULL 
     AND (l.last_at IS NULL OR l.last_at <= g.gate_at)
    THEN g.distinct_id 
  END) / nullIf(count(DISTINCT g.distinct_id), 0), 2) AS pct_stopped_after_gate
FROM gate_viewers g
LEFT JOIN upgraded u ON g.distinct_id = u.distinct_id
LEFT JOIN last_activity l ON g.distinct_id = l.distinct_id
```

**Interpretation:**
- **Low % upgraded** → Problem: gate blocks without converting.
- **High % stopped after gate** → Problem: gate causes churn.
- **Action:** Adjust gate placement, copy, or pricing.

---

## 5) Entry Path Retention

**Question:** By first landing path and UTM, what are signup rate, activation rate, and 7-day repeat rate?

### PostHog HogQL (using first-visit / pageview)

```sql
-- Entry path: use first user_first_visit or pageview_server
WITH first_touch AS (
  SELECT 
    distinct_id,
    argMin(
      coalesce(properties.landing_page, properties.path, '/'),
      timestamp
    ) AS initial_pathname,
    argMin(coalesce(properties.utm_source, '(none)'), timestamp) AS utm_source,
    min(timestamp) AS first_seen
  FROM events
  WHERE event IN ('user_first_visit', 'pageview_server')
    AND timestamp >= now() - INTERVAL 90 DAY
  GROUP BY distinct_id
),
signups AS (
  SELECT distinct_id FROM events
  WHERE event = 'signup_completed' AND timestamp >= now() - INTERVAL 90 DAY
  GROUP BY distinct_id
),
activated AS (
  SELECT distinct_id, min(timestamp) AS first_act
  FROM events
  WHERE event IN ('chat_sent', 'deck_saved') AND timestamp >= now() - INTERVAL 90 DAY
  GROUP BY distinct_id
),
repeat_7d AS (
  SELECT a.distinct_id
  FROM activated a
  JOIN events e ON e.distinct_id = a.distinct_id 
    AND e.event IN ('chat_sent', 'deck_saved')
    AND e.timestamp > a.first_act
    AND dateDiff('day', a.first_act, e.timestamp) >= 7
  WHERE e.timestamp >= now() - INTERVAL 90 DAY
  GROUP BY a.distinct_id
)
SELECT
  f.initial_pathname,
  f.utm_source,
  count(DISTINCT f.distinct_id) AS visitors,
  count(DISTINCT s.distinct_id) AS signups,
  round(100.0 * count(DISTINCT s.distinct_id) / nullIf(count(DISTINCT f.distinct_id), 0), 2) AS signup_rate,
  count(DISTINCT act.distinct_id) AS activated,
  round(100.0 * count(DISTINCT act.distinct_id) / nullIf(count(DISTINCT f.distinct_id), 0), 2) AS activation_rate,
  count(DISTINCT r.distinct_id) AS repeat_7d,
  round(100.0 * count(DISTINCT r.distinct_id) / nullIf(count(DISTINCT act.distinct_id), 0), 2) AS repeat_rate_7d
FROM first_touch f
LEFT JOIN signups s ON f.distinct_id = s.distinct_id
LEFT JOIN activated act ON f.distinct_id = act.distinct_id
LEFT JOIN repeat_7d r ON f.distinct_id = r.distinct_id
GROUP BY f.initial_pathname, f.utm_source
ORDER BY visitors DESC
LIMIT 100
```

**Note:** `argMin` may not exist in all HogQL dialects. Fallback: use a subquery to get the first event per user and read `properties.landing_page` / `properties.path` from that row.

### Supabase SQL (using user_attribution + auth + ai_usage)

Use when you want to tie entry path to AI usage and signups in your own DB. `user_attribution` has `initial_pathname` and `utm_source`; join to `auth.users` and `ai_usage` for activation.

**Note:** Supabase does not have `chat_sent` or `deck_saved` events. We use `ai_usage` (AI usage) and `decks` (deck creation) as proxies. `user_attribution.user_id` must be populated (user logged in after first visit) for joins to work.

```sql
-- Entry path retention (Supabase)
-- Requires: user_attribution, auth.users, ai_usage, decks
WITH attr AS (
  SELECT 
    anon_id,
    user_id,
    initial_pathname,
    utm_source,
    first_seen_at
  FROM user_attribution
  WHERE first_seen_at >= now() - INTERVAL '90 days'
),
signups AS (
  SELECT id AS user_id, created_at
  FROM auth.users
  WHERE created_at >= now() - INTERVAL '90 days'
),
-- Activation = used AI or created deck
activated AS (
  SELECT user_id FROM ai_usage WHERE user_id IS NOT NULL AND created_at >= now() - INTERVAL '90 days'
  UNION
  SELECT user_id FROM decks WHERE created_at >= now() - INTERVAL '90 days'
),
-- Repeat 7d = user had 2+ AI uses with 7+ days between first and a later use
repeat_7d AS (
  SELECT u.user_id
  FROM ai_usage u
  JOIN ai_usage u2 ON u.user_id = u2.user_id
    AND u2.created_at > u.created_at
    AND u2.created_at >= u.created_at + INTERVAL '7 days'
  WHERE u.user_id IS NOT NULL
    AND u.created_at >= now() - INTERVAL '90 days'
  GROUP BY u.user_id
)
SELECT
  a.initial_pathname,
  a.utm_source,
  count(DISTINCT a.anon_id) AS attributed_visitors,
  count(DISTINCT s.user_id) AS signups,
  round(100.0 * count(DISTINCT s.user_id) / nullIf(count(DISTINCT a.anon_id), 0), 2) AS signup_rate,
  count(DISTINCT act.user_id) AS activated,
  round(100.0 * count(DISTINCT act.user_id) / nullIf(count(DISTINCT a.anon_id), 0), 2) AS activation_rate,
  count(DISTINCT r.user_id) AS repeat_7d,
  round(100.0 * count(DISTINCT r.user_id) / nullIf(count(DISTINCT act.user_id), 0), 2) AS repeat_rate_7d
FROM attr a
LEFT JOIN signups s ON a.user_id = s.user_id
LEFT JOIN activated act ON a.user_id = act.user_id
LEFT JOIN repeat_7d r ON a.user_id = r.user_id
GROUP BY a.initial_pathname, a.utm_source
ORDER BY attributed_visitors DESC
LIMIT 100;
```

**Interpretation:**
- **Low signup rate for a path** → Problem: that entry path doesn’t convert.
- **Low activation rate** → Problem: path attracts visitors who don’t engage.
- **Low repeat rate** → Problem: path brings one-and-done users.
- **Action:** Adjust acquisition, landing pages, or onboarding for weak paths.

---

## Metric Summary: What Indicates a Problem

| Metric | Problem threshold | Likely cause |
|--------|-------------------|--------------|
| Signup → 24h activation | < 40% | Weak onboarding, unclear value |
| 7-day repeat after activation | < 25% | Low habit formation, no reason to return |
| Login without activation | > 30% | Returning users don’t re-engage |
| Pro gate → upgrade | < 5% | Gate friction, pricing, or value mismatch |
| Pro gate → stopped | > 20% | Gate causes churn |
| Entry path activation rate | Varies by path | Some paths attract wrong audience or weak UX |

---

## Notes

- **Property names:** PostHog may store custom properties as `properties.path` or `properties.$path`. Check your Data Management > Properties to confirm. Adjust `properties.landing_page`, `properties.path`, `properties.utm_source` if needed.
- **Time range:** Queries use `now() - INTERVAL 90 DAY`. Shorten for faster runs.
- **Identity merging:** PostHog merges `visitor_id` and `user_id` when users sign up. For user-level funnels, `distinct_id` should resolve correctly. If results look off, try filtering by `person_id` or `$device_id` where applicable.

---

## Event Reference (ManaTap → PostHog)

| Event | Source | distinct_id |
|-------|--------|-------------|
| signup_completed | auth-event API | user_id |
| login_completed | auth-event API | user_id |
| chat_sent | server (chat routes) | user_id or visitor_id |
| deck_saved | server (decks/create) | user_id |
| pro_gate_viewed | client (ProBadge, etc.) | user_id or visitor_id |
| pro_upgrade_completed | server (Stripe webhook, thank-you) | user_id |
| user_first_visit | middleware, FirstVisitTracker | visitor_id |
| pageview_server | middleware | visitor_id |

**Note:** PostHog merges `visitor_id` and `user_id` when a user signs up. For user-level funnels, prefer `person_id` if available, or ensure your HogQL uses the merged identity.
