/**
 * Scanner model tier routing smoke test.
 * Run: npx tsx tests/unit/scan-ai-models.test.ts
 */
import assert from "node:assert";
import {
  getScannerDisambiguateModel,
  getScannerVisionModel,
} from "@/lib/scanner/scan-ai-models";
import { DEFAULT_FREE_MODEL, DEFAULT_GUEST_MODEL, DEFAULT_PRO_CHAT_MODEL, DEFAULT_PRO_DECK_MODEL } from "@/lib/ai/default-models";

async function main() {
  const guest = getScannerDisambiguateModel({ userTier: "guest", realUserId: null, isPro: false });
  assert.equal(guest.tier, "guest");
  assert.ok(guest.model.length > 0);

  const free = getScannerDisambiguateModel({
    userTier: "free",
    realUserId: "user-1",
    isPro: false,
  });
  assert.equal(free.tier, "free");

  const proText = getScannerDisambiguateModel({
    userTier: "pro",
    realUserId: "user-1",
    isPro: true,
  });
  assert.equal(proText.tier, "pro");

  const assist = getScannerVisionModel(
    { userTier: "free", realUserId: "user-1", isPro: false },
    "fallback"
  );
  assert.equal(assist.tier, "free");

  const improve = getScannerVisionModel(
    { userTier: "pro", realUserId: "user-1", isPro: true },
    "improve"
  );
  assert.equal(improve.tier, "pro");
  assert.ok(improve.model);

  console.log("scan-ai-models.test.ts: ok", {
    guest: guest.model,
    defaults: {
      guest: DEFAULT_GUEST_MODEL,
      free: DEFAULT_FREE_MODEL,
      proChat: DEFAULT_PRO_CHAT_MODEL,
      proDeck: DEFAULT_PRO_DECK_MODEL,
    },
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
