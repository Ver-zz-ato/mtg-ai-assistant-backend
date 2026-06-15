/** Canonical public route for ManaTap AI Chat. */
export const CHAT_ROUTE = "/chat";

export function isChatPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, "") || "/";
  return path === CHAT_ROUTE || path.startsWith(`${CHAT_ROUTE}/`);
}
