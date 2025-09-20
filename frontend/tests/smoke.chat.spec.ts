import { test, expect } from "@playwright/test";

test("smoke: chat roundtrip", async ({ page }) => {
  // This is a placeholder; adapt selectors to your UI.
  await page.goto("/");
  await page.getByPlaceholder("Type a message…").fill("hello");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("assistant", { exact: false })).toBeVisible({ timeout: 15000 });
});
