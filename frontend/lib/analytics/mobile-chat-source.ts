/**
 * Optional mobile client entry source on chat POST bodies (`chat_source` / `chatSource`).
 * Must stay aligned with Manatap-APP `src/lib/chat-started-source.ts` whitelist.
 */
const ALLOWED = new Set([
  "deck",
  "chat_tab",
  "home_feed",
  "home_chat",
  "hamburger",
  "thread_switch",
  "thread_new",
  "unknown",
]);

export function sanitizeMobileChatSource(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const s =
    typeof r.chat_source === "string"
      ? r.chat_source.trim()
      : typeof r.chatSource === "string"
        ? r.chatSource.trim()
        : "";
  if (!s || s.length > 64) return undefined;
  return ALLOWED.has(s) ? s : undefined;
}
