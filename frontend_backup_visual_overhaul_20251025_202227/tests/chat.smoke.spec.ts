// tests/chat.smoke.spec.ts
import { test, expect } from "@playwright/test";

test("chat thread lifecycle + debug endpoints", async ({ page }) => {
  await page.goto("/");
  // Echo debug tells us env + auth status
  const echo = await page.request.get("/api/chat/debug/echo");
  expect(echo.ok()).toBeTruthy();
  const echoJson = await echo.json();
  expect(echoJson.ok).toBeTruthy();

  // Create via messages
  const res = await page.request.post("/api/chat/messages", { data: { message: { role: "user", content: "ping" } } });
  expect(res.ok()).toBeTruthy();
  const env = await res.json();
  expect(env.ok).toBeTruthy();
  const tid = env.data.threadId as string;

  // Pull messages
  const msgs = await page.request.get(`/api/chat/threads/messages?threadId=${tid}`);
  expect(msgs.ok()).toBeTruthy();
  const msgsJson = await msgs.json();
  expect(msgsJson.ok).toBeTruthy();
  expect((msgsJson.data as any[]).length).toBeGreaterThan(0);
});
