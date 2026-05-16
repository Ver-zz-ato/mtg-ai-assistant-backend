import assert from "node:assert/strict";
import { getRecommendationTierConfig, resolveRecommendationTier } from "@/lib/recommendations/recommendation-tier";

async function main() {
  assert.equal(resolveRecommendationTier({ isGuest: true, userId: null, isPro: true }), "guest");
  assert.equal(resolveRecommendationTier({ isGuest: false, userId: "u1", isPro: false }), "free");
  assert.equal(resolveRecommendationTier({ isGuest: false, userId: "u1", isPro: true }), "pro");

  const guest = getRecommendationTierConfig("guest");
  const free = getRecommendationTierConfig("free");
  const pro = getRecommendationTierConfig("pro");

  assert.equal(guest.model, "gpt-5.4-mini");
  assert.equal(free.model, "gpt-5.4");
  assert.equal(pro.model, "gpt-5.5");
  assert.ok(guest.candidateLimit < free.candidateLimit);
  assert.ok(free.candidateLimit < pro.candidateLimit);
  assert.equal(guest.judgePasses, 1);
  assert.equal(free.judgePasses, 2);
  assert.equal(pro.useCriticPass, true);

  console.log("recommendation-tiering: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
