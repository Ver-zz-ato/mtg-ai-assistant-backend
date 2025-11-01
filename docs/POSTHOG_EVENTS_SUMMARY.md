# PostHog Events Currently Tracked

Extracted from actual codebase grep search.

## Auth Events
- `auth_login_attempt` (method)
- `auth_login_failed` (method, error_type)
- `auth_login_success` (method)
- `auth_logout_attempt`
- `auth_logout_success`
- `auth_logout_failed` (error)
- `auth_logout_timeout_fallback`
- `email_verification_resent` (email)
- `email_verification_resend_failed` (error)
- `email_verification_reminder_shown` (hours_since_signup)
- `email_verification_reminder_dismissed`
- `email_verified_success` (user_id)
- `email_verification_popup_dismissed`
- `email_verification_resent_on_login` (email)
- `email_verification_resent_on_signup` (email)
- `email_verification_resent_from_profile` (email)

## Navigation Events
- `nav_link_clicked` (destination, source: header/mobile_menu)
- `help_menu_clicked` (link)
- `command_palette_opened`
- `command_palette_action` (command)
- `shortcut_used` (key, action)
- `shortcuts_help_opened`

## Chat Events
- `chat_sent` (chars, source)
- `guest_chat_restored` (message_count)
- `chat_stream_stop` (stopped_by)
- `chat_stream_fallback` (reason)
- `chat_guest_limit` (message_count)
- `chat_stream_error` (reason)
- `chat_feedback` (rating, thread_id, msg_id)
- `guest_limit_warning_15`
- `guest_limit_warning_18`
- `guest_limit_modal_shown` (message_count)
- `guest_limit_signup_clicked` (message_count)
- `guest_limit_signin_clicked` (message_count)

## Deck Events
- `deck_card_added` (deck_id, ...)
- `deck_card_quantity_changed` (deck_id, ...)
- `bulk_delete_cards` (deck_id, ...)
- `deck_card_removed` (deck_id, ...)
- `deck_created` (deck_id, user_id, name)
- `deck_copied` (original_deck, source_user)
- `public_deck_viewed` (deck_id, source)

## Collection Events
- `collection_created` (collection_id, user_id, name)
- `collection_deleted` (collection_id, user_id)

## Wishlist Events
- `wishlist_card_added` (wishlist_id, user_id, name)

## Profile Events
- `profile_view`
- `profile_wishlist_save` (count)
- `profile_username_change`
- `profile_fav_commander_set`
- `profile_pricing_cta_clicked` (source)
- `profile_share` (user_id, is_public)

## Pricing Events
- `pricing_page_viewed` (is_authenticated)
- `pricing_upgrade_clicked` (is_authenticated, plan, source)
- `billing_portal_clicked` (source)
- `pricing_interval_changed` (interval)

## Theme/UI Events
- `theme_changed` (from, to)
- `rate_limit_warning_shown` (percent_used)
- `rate_limit_indicator_clicked` (percent_used)
- `empty_state_primary_action` (title)
- `empty_state_secondary_action` (title)

## iOS/PWA Events
- `ios_pwa_visit_tracked` (visit_count)
- `ios_pwa_prompted` (visit_count)
- `ios_pwa_dismissed`
- `ios_pwa_instructions_viewed`

## Server-Side Events (via captureServer)
- `collection_deleted` (collection_id, user_id)
- `collection_created` (collection_id, user_id, name)
- `profile_share` (user_id, is_public)
- `deck_deleted` (deck_id, user_id)
- `chat_thread_deleted` (thread_id, user_id)
- `chat_thread_renamed` (thread_id, user_id, title)
- `chat_thread_linked` (thread_id, user_id, deck_id)
- `watchlist_card_added` (watchlist_id, user_id, name)
- `watchlist_card_removed` (watchlist_id, user_id, name)

## Notes
- Many events have contextual properties (user_id, source, method, etc.)
- Some events tracked client-side with `capture()`, others server-side with `captureServer()`
- Some events are planned but may not be implemented yet (workflow.*, performance.*, error.*)

