/**
 * Unit tests for 3-tier prompt classifier.
 * Run: npx tsx tests/unit/prompt-tier.test.ts
 */
import assert from "node:assert";
import {
  classifyPromptTier,
  MICRO_PROMPT,
  estimateSystemPromptTokens,
} from "@/lib/ai/prompt-tier";

const base = (overrides: Partial<Parameters<typeof classifyPromptTier>[0]> = {}) => ({
  text: "",
  hasDeckContext: false,
  deckContextForCompose: null,
  ...overrides,
});

// --- MICRO: greetings ---
const hello = classifyPromptTier(base({ text: "hello" }));
assert.strictEqual(hello.tier, "micro");
assert.strictEqual(hello.reason, "greeting");

const hi = classifyPromptTier(base({ text: "hi" }));
assert.strictEqual(hi.tier, "micro");

const thanks = classifyPromptTier(base({ text: "thanks" }));
assert.strictEqual(thanks.tier, "micro");

// --- MICRO: simple definitions ---
const whatTrample = classifyPromptTier(base({ text: "what is trample" }));
assert.strictEqual(whatTrample.tier, "micro");
assert.strictEqual(whatTrample.reason, "simple_definition");

const whatWard = classifyPromptTier(base({ text: "what does ward do" }));
assert.strictEqual(whatWard.tier, "micro");

// --- STANDARD: short but NOT trivial (length alone is NOT enough) ---
const bestBudgetRamp = classifyPromptTier(base({ text: "best budget ramp?" }));
assert.strictEqual(bestBudgetRamp.tier, "standard");
assert.notStrictEqual(bestBudgetRamp.tier, "micro");

const helpWithCuts = classifyPromptTier(base({ text: "help with cuts?" }));
assert.strictEqual(helpWithCuts.tier, "standard");

const whyNoLands = classifyPromptTier(base({ text: "why no lands?" }));
assert.strictEqual(whyNoLands.tier, "standard");

// --- STANDARD: format legality ---
const solRingPioneer = classifyPromptTier(base({ text: "is Sol Ring legal in Pioneer?" }));
assert.strictEqual(solRingPioneer.tier, "standard");

// --- FULL: deck context ---
const analyzeWithDeck = classifyPromptTier(base({ text: "analyze my deck", hasDeckContext: true }));
assert.strictEqual(analyzeWithDeck.tier, "full");
assert.strictEqual(analyzeWithDeck.reason, "deck_context");

// --- FULL: explicit list request (even without deck) ---
const giveMe10Swaps = classifyPromptTier(base({ text: "give me 10 swaps" }));
assert.strictEqual(giveMe10Swaps.tier, "full");
assert.strictEqual(giveMe10Swaps.reason, "explicit_list_request");

const suggest5UpgradesWithDeck = classifyPromptTier(base({ text: "suggest 5 upgrades", hasDeckContext: true }));
assert.strictEqual(suggest5UpgradesWithDeck.tier, "full", "deck context forces full tier");

const suggest5UpgradesNoDeck = classifyPromptTier(base({ text: "suggest 5 upgrades" }));
assert.strictEqual(suggest5UpgradesNoDeck.tier, "full", "explicit list request forces full even without deck");

// --- MICRO_PROMPT and estimate ---
assert.ok(MICRO_PROMPT.length > 50);
assert.ok(MICRO_PROMPT.includes("ManaTap AI"));
assert.ok(MICRO_PROMPT.includes("[[Double Brackets]]"));

const est = estimateSystemPromptTokens(MICRO_PROMPT);
assert.ok(est >= 15);
assert.ok(est <= 150);

console.log("prompt-tier.test.ts: all assertions passed.");
export {};
