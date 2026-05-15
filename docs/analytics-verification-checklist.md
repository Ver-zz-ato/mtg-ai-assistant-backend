# Analytics Verification Checklist

Use this after shipping analytics changes to verify both the website and mobile app in PostHog without exposing user content.

## Website

- First website visit with UTM params:
  - Open the site in a fresh browser session with `utm_source`, `utm_medium`, and `utm_campaign`.
  - Confirm `pageview_server` fires with `pathname`, sanitized `full_url`, `session_id`, `referrer`, `referring_domain`, first-touch fields, and `platform=server`.
  - Confirm `user_first_visit` fires once for the new visitor.

- Signup/login attribution:
  - Sign up or log in from a fresh attributed session.
  - Confirm `signup_completed` or `login_completed` includes first-touch and current-touch attribution fields.
  - Confirm `auth_login_success` remains present for backward compatibility.
  - Confirm person properties update with `first_acquisition_channel`, `first_landing_path`, `first_platform`, `has_saved_deck`, and `has_used_ai` when applicable.

## Mobile App

- App open:
  - Launch the app from a cold start.
  - Confirm `app_open`, `session_started`, and `first_mobile_app_open` only fire once per session/device as intended.

- Mobile screen tracking:
  - Navigate between major screens.
  - Confirm PostHog screen events use sanitized routes such as `/chat/[threadId]` instead of raw ids.
  - Confirm screen payloads include `route_path`, `platform=app`, `app_surface=mobile_app`, `app_version`, and `build_number`.

## Feature Flows

- Chat sent / response received:
  - Send a chat message on web and app.
  - Confirm `chat_sent` and `chat_response_received` fire.
  - Confirm no raw `thread_id`, prompt text, user message text, or assistant message text is present in event properties.

- AI call completed:
  - Trigger a server-backed AI flow.
  - Confirm `ai_call_started` and `ai_call_completed` fire with `feature`, `model`, `provider`, `route`, `latency_ms`, and token/cost fields when available.
  - Confirm failed calls emit `ai_call_failed` with `error_code` but without prompt/completion text.

- Playstyle quiz:
  - Start and complete the quiz.
  - Confirm `playstyle_quiz_started`, `playstyle_quiz_completed`, `playstyle_quiz_result_viewed`, and the matching first-* events only fire once where expected.

- Budget swaps:
  - Open the tool and generate swaps.
  - Confirm `budget_swaps_started`, `budget_swaps_generated`, `budget_swap_applied`, `budget_swap_saved`, or `budget_swaps_failed` as appropriate.

- Deck compare:
  - Run one successful compare and one failure path if possible.
  - Confirm `deck_compare_started`, `deck_compare_completed`, and `deck_compare_failed`.

## Privacy Checks

- Inspect recent analytics events in PostHog and verify these are not present:
  - email addresses
  - `user_email`
  - raw `thread_id`
  - prompt text
  - chat text
  - assistant response text
  - full decklists
  - card collection payloads

- Verify the replacement presence flags appear instead where relevant:
  - `thread_id_present`
  - `user_message_present`
  - `assistant_message_present`
  - `decklist_present`
  - `collection_present`
