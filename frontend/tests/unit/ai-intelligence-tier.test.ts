import assert from "node:assert/strict";
import { getAiTierCapabilities, resolveManaTapTier } from "../../lib/ai/tier-policy";
import { formatDeckIntelligencePacketForPrompt, type DeckIntelligencePacket } from "../../lib/ai/intelligence/packet";
import { buildIntelligenceToolResults } from "../../lib/ai/intelligence/tool-registry";

function packet(tier: "guest" | "free" | "pro"): DeckIntelligencePacket {
  const capabilities = getAiTierCapabilities(tier);
  return {
    version: "2026-05-12.v1",
    tier,
    capabilities,
    format: "Commander",
    commander: "Chatterfang, Squirrel General",
    cardCount: 100,
    summary: null,
    spine: {
      protectedCards: [],
      mustKeep: ["Chatterfang, Squirrel General", "Pitiless Plunderer"],
      important: ["Skullclamp"],
      dangerousCuts: [{ name: "Pitiless Plunderer", reason: "part of detected combo" }],
      combosPresent: [{ name: "Chatterfang combo", pieces: ["Chatterfang, Squirrel General", "Pitiless Plunderer"], note: "token loop" } as any],
      combosMissing: [],
    },
    collectionFit: tier === "guest" ? null : {
      mode: tier === "pro" ? "full" : "basic",
      ownedCount: 70,
      missingCount: 30,
      buildablePercent: 70,
      ownedSample: ["Skullclamp"],
      missingSample: ["Doubling Season"],
    },
    powerProfile: tier === "guest" ? null : {
      commanderBracket: "upgraded",
      notes: ["1 complete combo line detected."],
    },
    memories: tier === "pro" ? [{ type: "table_tolerance", text: "No mass land destruction." }] : [],
  };
}

async function main() {
  assert.equal(resolveManaTapTier({ isGuest: true, userId: null, isPro: true }), "guest");
  assert.equal(resolveManaTapTier({ userId: "u1", isPro: false }), "free");
  assert.equal(resolveManaTapTier({ userId: "u1", isPro: true }), "pro");

  assert.equal(getAiTierCapabilities("guest").deckMutations, false);
  assert.equal(getAiTierCapabilities("free").includeCollectionFit, "basic");
  assert.equal(getAiTierCapabilities("pro").includeCollectionFit, "full");
  assert.equal(getAiTierCapabilities("pro").includeDurableMemories, true);

  const prompt = formatDeckIntelligencePacketForPrompt(packet("pro"));
  assert.match(prompt, /MANA TAP DECK INTELLIGENCE PACKET/);
  assert.match(prompt, /Do not cut deck-spine cards casually/);
  assert.match(prompt, /CONFIRMED USER \/ DECK MEMORIES/);

  const tools = buildIntelligenceToolResults(packet("free"));
  assert.ok(tools.some((tool) => tool.kind === "deck_spine"));
  assert.ok(tools.some((tool) => tool.kind === "combo_detection"));
  assert.ok(tools.some((tool) => tool.kind === "collection_fit"));

  console.log("ai-intelligence-tier.test.ts passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
