/**
 * Mobile vs web attribution for server-side `chat_sent` PostHog events.
 * Aligns with Manatap-APP `X-ManaTap-Client`, `usageSource`, `sourcePage`, and `chat_source`.
 */
import { resolveAiUsageSourceForRequest, AI_USAGE_SOURCE_MANATAP_APP } from "@/lib/ai/manatap-client-origin";
import { sanitizeMobileChatSource } from "@/lib/analytics/mobile-chat-source";

export type MobileChatAnalyticsProps = {
  platform: "app";
  app_surface: "mobile_app";
  source: string;
};

function resolveAppSourcePage(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const sp =
    typeof r.sourcePage === "string"
      ? r.sourcePage.trim()
      : typeof r.source_page === "string"
        ? r.source_page.trim()
        : "";
  return sp || undefined;
}

function isMobileChatRequest(req: Request, raw: unknown, clientEntrySource?: string): boolean {
  if (clientEntrySource) return true;
  if (sanitizeMobileChatSource(raw)) return true;
  if (resolveAiUsageSourceForRequest(req, raw, null) === AI_USAGE_SOURCE_MANATAP_APP) return true;
  const sourcePage = resolveAppSourcePage(raw);
  return Boolean(sourcePage?.startsWith("app_"));
}

/**
 * When the chat POST is from the mobile app, returns props that override
 * `captureServer` defaults (`platform: server` → `platform: app`).
 */
export function resolveMobileChatAnalyticsProps(
  req: Request,
  raw: unknown,
  clientEntrySource?: string
): MobileChatAnalyticsProps | null {
  const entrySource = clientEntrySource ?? sanitizeMobileChatSource(raw);
  if (!isMobileChatRequest(req, raw, entrySource)) return null;

  return {
    platform: "app",
    app_surface: "mobile_app",
    source: entrySource ?? "unknown",
  };
}
