import assert from "node:assert/strict";
import { resolveMobileChatAnalyticsProps } from "../../lib/analytics/mobile-chat-attribution";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://www.manatap.ai/api/chat/stream", {
    method: "POST",
    headers,
  });
}

const webBody = { text: "hi", sourcePage: "chat_thread" };
const mobileBody = { text: "hi", sourcePage: "app_chat_thread", usageSource: "manatap_app" };

assert.deepEqual(resolveMobileChatAnalyticsProps(req(), webBody), null);

assert.deepEqual(resolveMobileChatAnalyticsProps(req(), mobileBody), {
  platform: "app",
  app_surface: "mobile_app",
  source: "unknown",
});

assert.deepEqual(
  resolveMobileChatAnalyticsProps(req({ "x-manatap-client": "manatap_app" }), webBody),
  {
    platform: "app",
    app_surface: "mobile_app",
    source: "unknown",
  }
);

assert.deepEqual(resolveMobileChatAnalyticsProps(req(), { ...mobileBody, chat_source: "home_chat" }), {
  platform: "app",
  app_surface: "mobile_app",
  source: "home_chat",
});

assert.deepEqual(
  resolveMobileChatAnalyticsProps(req(), mobileBody, "deck"),
  {
    platform: "app",
    app_surface: "mobile_app",
    source: "deck",
  }
);

console.log("mobile-chat-attribution.test.ts: ok");
