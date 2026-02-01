/**
 * Shared chat/message limits by tier.
 * Used by API routes (guest-limit-check, chat, stream) and UI (Chat.tsx).
 * Pro limit is server-only; do not show in UI.
 */

/** Guest: total messages per session (not per day). */
export const GUEST_MESSAGE_LIMIT = 10;

/** Free (logged-in): messages per day. */
export const FREE_DAILY_MESSAGE_LIMIT = 50;

/** Pro: messages per day (server-side only; do not display in UI). */
export const PRO_DAILY_MESSAGE_LIMIT = 500;
