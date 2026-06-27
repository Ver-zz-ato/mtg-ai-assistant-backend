/** Canonical public route for ManaTap Chat. */
export const CHAT_ROUTE = "/chat";

const CHAT_DRAFT_STORAGE_KEY = "manatap_pending_chat_draft";

export function isChatPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, "") || "/";
  return path === CHAT_ROUTE || path.startsWith(`${CHAT_ROUTE}/`);
}

/** True when the page hosts ChatHomeWorkspace (e.g. /chat or archived /old-home). */
export function hasEmbeddedChatShell(): boolean {
  if (typeof window === "undefined") return false;
  if (isChatPath(window.location.pathname)) return true;
  return !!document.querySelector("[data-chat-area]");
}

export function buildChatDraftUrl(prompt: string): string {
  const trimmed = prompt.trim();
  return `${CHAT_ROUTE}?chatDraft=${encodeURIComponent(trimmed)}`;
}

/**
 * Hand off a prompt into chat from tools, card modal, commander pages, etc.
 * In-place when chat is already mounted; otherwise localStorage + navigate to /chat.
 */
export function openChatPrompt(prompt: string, options?: { autoSubmit?: boolean }): void {
  if (typeof window === "undefined") return;
  const trimmed = prompt.trim();
  if (!trimmed) return;

  window.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, trimmed);

  if (hasEmbeddedChatShell()) {
    const eventName = options?.autoSubmit ? "quiz-build-deck" : "manatap-chat-draft";
    window.dispatchEvent(new CustomEvent(eventName, { detail: { message: trimmed } }));
    document.querySelector("[data-chat-area]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  window.location.href = CHAT_ROUTE;
}

/** Pricing/analytics: did the user arrive from a chat surface (incl. legacy root chat)? */
export function isChatReferrer(referrer: string): boolean {
  if (!referrer) return false;
  if (
    referrer.includes("/chat") ||
    referrer.includes("/new-chat") ||
    referrer.includes("/old-home")
  ) {
    return true;
  }
  try {
    const u = new URL(referrer);
    const path = u.pathname.replace(/\/$/, "") || "/";
    if (path === "/" && u.searchParams.has("chatDraft")) return true;
  } catch {
    // ignore malformed referrer
  }
  return false;
}
