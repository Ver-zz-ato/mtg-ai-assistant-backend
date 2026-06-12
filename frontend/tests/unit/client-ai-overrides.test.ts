/**
 * Unit tests for server-side AI override enforcement.
 * Run: npx tsx tests/unit/client-ai-overrides.test.ts
 */
import assert from "node:assert";
import {
  canUseClientAiOverrides,
  resolveChatModel,
  resolveModelForRequest,
  resolveOverlayTier,
} from "@/lib/ai/client-ai-overrides";

assert.strictEqual(canUseClientAiOverrides(false), false);
assert.strictEqual(canUseClientAiOverrides(true), true);

const freeOverlay = resolveOverlayTier({
  isGuest: false,
  userId: "user-1",
  isPro: false,
  clientForceTier: "pro",
  allowClientOverrides: false,
});
assert.strictEqual(freeOverlay, "free");

const { model: guestBlockedModel } = resolveModelForRequest({
  isGuest: false,
  userId: "user-1",
  isPro: false,
  useCase: "chat",
  clientModelOverride: "gpt-5.4",
  allowClientOverrides: false,
});
assert.ok(guestBlockedModel.toLowerCase().includes("mini"));

const { model: adminDeckModel } = resolveModelForRequest({
  isGuest: true,
  userId: null,
  isPro: false,
  useCase: "deck_analysis",
  clientModelOverride: "gpt-5.4",
  allowClientOverrides: true,
});
assert.strictEqual(adminDeckModel, "gpt-5.4");

const { model: adminChatRejected } = resolveModelForRequest({
  isGuest: true,
  userId: null,
  isPro: false,
  useCase: "chat",
  clientModelOverride: "gpt-5.2-codex",
  allowClientOverrides: true,
});
assert.ok(adminChatRejected.toLowerCase().includes("mini"));

const { model: freeChatModel } = resolveChatModel({
  isGuest: false,
  userId: "user-1",
  isPro: false,
  useMidTier: true,
  clientModelOverride: "gpt-5.4",
  allowClientOverrides: false,
});
assert.ok(freeChatModel.toLowerCase().includes("mini"));

const adminGuestOverlay = resolveOverlayTier({
  isGuest: false,
  userId: "admin-1",
  isPro: true,
  clientForceTier: "guest",
  allowClientOverrides: true,
});
assert.strictEqual(adminGuestOverlay, "guest");

console.log("client-ai-overrides.test.ts: all assertions passed");
