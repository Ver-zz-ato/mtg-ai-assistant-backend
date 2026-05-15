# ManaTap Analytics Taxonomy

## Purpose

This document defines the additive analytics taxonomy shared across the ManaTap website, API, and mobile app. It is designed to preserve existing PostHog dashboards while giving new events a consistent, typed shape.

## Event naming rules

- Preserve all legacy event names already used in dashboards.
- New events use `snake_case`.
- Prefer explicit lifecycle verbs such as `opened`, `started`, `completed`, `failed`, `dismissed`, `viewed`, and `clicked`.
- Prefer one stable event name per meaningful product action instead of many near-duplicates.
- Prefer central helper functions over direct `posthog.capture(...)` calls.

## Required common properties

All new typed analytics helpers should attach these fields when available:

| Property | Type | Notes |
| --- | --- | --- |
| `platform` | `web \| app \| server` | Origin of the event |
| `app_surface` | `website \| mobile_app \| api \| admin` | Product surface |
| `user_tier` | `guest \| free \| pro \| unknown` | Do not infer Pro unless known |
| `logged_in` | `boolean` | `false` for guest and anonymous flows |
| `source_surface` | `string \| null` | Entry surface or screen |
| `source_feature` | `string \| null` | Product feature or tool id |
| `route_path` | `string \| null` | Sanitized route, never raw sensitive params |
| `session_id` | `string \| null` | Stable per web session / app launch session |
| `app_version` | `string \| null` | Mobile app version when available |
| `build_number` | `string \| null` | Mobile build number when available |
| `environment` | `string` | Usually `development`, `preview`, or `production` |
| `deck_id_present` | `boolean` | Prefer this over raw `deck_id` |
| `deck_format` | `commander \| standard \| modern \| pioneer \| pauper \| unknown \| null` | Only when known |

## Privacy rules

- Never send email addresses, chat text, prompts, completions, decklists, full collections, or raw user-generated content.
- Never send raw deck ids unless an existing safe pattern already depends on them.
- Never send bulk card names.
- When a card-specific action matters, prefer booleans like `card_name_present: true`.
- Strip sensitive query params from tracked URLs before capture.

## User lifecycle definitions

- `anonymous`: visitor or device without authenticated identity
- `guest`: product-defined guest session without full account ownership
- `free`: authenticated non-Pro user
- `pro`: authenticated paid user
- `unknown`: fallback when tier is not yet resolved

First-use milestone events should fire once per user or device when possible:

- `first_tool_used`
- `first_ai_chat`
- `first_deck_saved`
- `first_mulligan`
- `first_collection_created`
- `first_share`
- `first_pro_gate`
- `first_upgrade`
- `first_mobile_app_open`
- `first_playstyle_quiz_started`
- `first_playstyle_quiz_completed`

## Acquisition attribution rules

### First touch

Capture once for anonymous website visitors and never overwrite:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `referrer`
- `referring_domain`
- `landing_path`
- `landing_url`
- `channel_type`
- `first_seen_at`

### Current touch

Update per session when present:

- current UTM values
- current referrer / referring domain
- current landing path / URL

### Signup and login attachment

Attach first-touch and current-touch properties to:

- `signup_completed`
- `auth_login_success`

When identify/set-once is available, set:

- `first_seen_week`
- `signup_week`
- `first_acquisition_channel`
- `first_landing_path`
- `first_platform`

## Feature outcome event rules

Feature funnels should prefer a simple progression:

- `opened`
- `started`
- `completed`
- `failed`
- `abandoned` when practical

Examples:

- Deck builder: `deck_builder_started`, `deck_builder_card_added`, `deck_saved`
- Chat: `chat_started`, `chat_sent`, `chat_response_received`, `chat_failed`
- Mulligan: `mulligan_opened`, `mulligan_hand_generated`, `mulligan_advice_requested`
- Budget swaps: `budget_swaps_started`, `budget_swaps_generated`, `budget_swap_applied`, `budget_swap_saved`, `budget_swaps_failed`
- Deck compare: `deck_compare_started`, `deck_compare_completed`, `deck_compare_failed`
- Playstyle quiz: `playstyle_quiz_started`, `playstyle_quiz_completed`, `playstyle_quiz_result_viewed`
- Pro/paywall: `pro_gate_viewed`, `paywall_viewed`, `pro_upgrade_started`, `pro_upgrade_completed`, `pro_upgrade_failed`

## AI cost and latency rules

Server-side AI analytics should use:

- `ai_call_started`
- `ai_call_completed`
- `ai_call_failed`

Preferred properties:

- `feature`
- `model`
- `provider`
- `route`
- `cache_hit`
- `input_tokens`
- `output_tokens`
- `total_tokens`
- `estimated_cost_usd`
- `latency_ms`
- `success`
- `error_code`
- `user_tier`
- `platform`
- `app_surface`
- `deck_format`
- `streamed`

If token or cost values are unavailable, send `null` rather than guessed numbers.

## Session quality rules

Session quality events are intentionally lightweight:

- `session_started`
- `session_engaged`
- `session_conversion_milestone`

Meaningful engagement examples:

- `chat_sent`
- `tool_action_started`
- `deck_saved`
- `deck_builder_card_added`
- `pro_gate_viewed`
- `collection_created`

Conversion milestone examples:

- `signup_completed`
- `first_deck_saved`
- `pro_upgrade_completed`

## Examples

### Web pageview

`pageview_server`

- `platform: "server"`
- `app_surface: "website"`
- `pathname`
- `full_url`
- `referrer`
- `referring_domain`
- `session_id`

### Mobile screen

`posthog.screen("/chat/[threadId]", props)`

- `platform: "app"`
- `app_surface: "mobile_app"`
- `route_path: "/chat/[threadId]"`
- `user_tier`
- `app_version`

### Server AI

`ai_call_completed`

- `platform: "server"`
- `app_surface: "api"`
- `feature: "chat"`
- `model`
- `latency_ms`
- `estimated_cost_usd`

### Paywall

`paywall_viewed`

- `context`
- `user_tier`
- `source_surface`

### Deck action

`deck_saved`

- `deck_id_present: true`
- `deck_format`
- `source_feature: "deck_builder"`

### Tool action

`tool_action_completed`

- `tool`
- `action`
- `duration_ms`
- `result_count`
