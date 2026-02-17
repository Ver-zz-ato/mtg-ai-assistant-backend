/**
 * Unit tests for test-mutation generator (deterministic output).
 * Run: npx tsx tests/unit/test-mutation.test.ts
 */

import { generateMutations } from "@/lib/ai/test-mutation";

const baseDeckCase = {
  id: "test-deck-1",
  name: "Commander ramp test",
  type: "deck_analysis" as const,
  input: {
    deckText: "1 Sol Ring\n1 Arcane Signet\n1 Cultivate\n1 Kodama's Reach",
    commander: "Tatyova, Benthic Druid",
    format: "Commander",
    colors: ["G", "U"],
  },
  expectedChecks: { minRampMention: 1 },
  tags: ["ramp", "commander"],
};

const baseChatCase = {
  id: "test-chat-1",
  name: "Land count question",
  type: "chat" as const,
  input: { userMessage: "How many lands for Commander?" },
  expectedChecks: { shouldContain: ["land"] },
  tags: ["lands"],
};

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Deterministic: same input → same output
function testDeterministic() {
  const out1 = generateMutations(baseDeckCase, ["reordered_lines"], 1);
  const out2 = generateMutations(baseDeckCase, ["reordered_lines"], 1);
  assert(out1.length === out2.length, "Same length");
  assert(
    JSON.stringify(out1[0]?.input?.deckText) === JSON.stringify(out2[0]?.input?.deckText),
    "Same deckText for reordered_lines"
  );
  console.log("✓ Deterministic output");
}

// Mutation types produce expected structure
function testMutationStructure() {
  const out = generateMutations(baseDeckCase, ["typos_decklist", "irrelevant_chatter"], 1);
  assert(out.length >= 1, "At least one mutation");
  for (const m of out) {
    assert(m.name.includes("[mutation:"), "Name includes mutation tag");
    assert(m.tags.includes("mutation"), "Tags include mutation");
    assert(m.mutationType, "Has mutationType");
  }
  console.log("✓ Mutation structure");
}

// near_miss_card produces different deck text
function testNearMissCard() {
  const out = generateMutations(baseDeckCase, ["near_miss_card"], 2);
  const hasChange = out.some((m) => m.input.deckText !== baseDeckCase.input.deckText);
  assert(hasChange || out.length === 0, "near_miss_card may change deck (or skip if no match)");
  console.log("✓ Near miss card");
}

// empty_user_message works for chat
function testEmptyUserMessage() {
  const out = generateMutations(baseChatCase, ["empty_user_message"], 1);
  assert(out.length === 1, "One mutation");
  assert(out[0].input.userMessage === "", "userMessage is empty");
  console.log("✓ Empty user message");
}

function main() {
  testDeterministic();
  testMutationStructure();
  testNearMissCard();
  testEmptyUserMessage();
  console.log("\nAll tests passed.");
}

main();
