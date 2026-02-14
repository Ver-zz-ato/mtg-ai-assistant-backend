/**
 * Unit tests for Layer 0 gate: layer0Decide, isDeckAnalysisRequest, isSimpleRulesOrTerm, isManaTapFaq, needsDeckButMissing.
 * Run: npx tsx tests/unit/layer0-gate.test.ts
 */
import assert from "node:assert";
import {
  layer0Decide,
  isDeckAnalysisRequest,
  isSimpleRulesOrTerm,
  isManaTapFaq,
  needsDeckButMissing,
} from "@/lib/ai/layer0-gate";
import { getFaqAnswer } from "@/lib/ai/static-faq";

const base = (overrides: Partial<Parameters<typeof layer0Decide>[0]> = {}) => ({
  text: "",
  hasDeckContext: false,
  isAuthenticated: true,
  route: "chat" as const,
  ...overrides,
});

// --- layer0Decide: NO_LLM cases ---
const empty = layer0Decide(base({ text: "" }));
assert.strictEqual(empty.mode, "NO_LLM");
assert.strictEqual((empty as any).handler, "need_more_info");
assert.strictEqual((empty as any).reason, "empty_input");

const whitespace = layer0Decide(base({ text: "   \n\t  " }));
assert.strictEqual(whitespace.mode, "NO_LLM");
assert.strictEqual((whitespace as any).handler, "need_more_info");

const analyzeNoDeck = layer0Decide(base({ text: "analyze my deck", hasDeckContext: false }));
assert.strictEqual(analyzeNoDeck.mode, "NO_LLM");
assert.strictEqual((analyzeNoDeck as any).reason, "needs_deck_no_context");
assert.strictEqual((analyzeNoDeck as any).handler, "need_more_info");

const improveNoDeck = layer0Decide(base({ text: "improve this deck", hasDeckContext: false }));
assert.strictEqual(improveNoDeck.mode, "NO_LLM");
assert.strictEqual((improveNoDeck as any).reason, "needs_deck_no_context");

const suggestSwapsNoDeck = layer0Decide(base({ text: "suggest swaps", hasDeckContext: false }));
assert.strictEqual(suggestSwapsNoDeck.mode, "NO_LLM");

// Static FAQ: getFaqAnswer returns answers for known app questions
assert.ok(getFaqAnswer("What does Budget Swap do?"), "FAQ matches budget swap");
assert.ok(getFaqAnswer("how do i paste a decklist"), "FAQ matches paste decklist");

// --- layer0Decide: MINI_ONLY cases ---
const whatIsWard = layer0Decide(base({ text: "what is ward?", hasDeckContext: false }));
assert.strictEqual(whatIsWard.mode, "MINI_ONLY");
assert.strictEqual((whatIsWard as any).reason, "simple_rules_or_term");
assert.strictEqual((whatIsWard as any).model, "gpt-4o-mini");
assert.strictEqual((whatIsWard as any).max_tokens, 128);

const whatTrample = layer0Decide(base({ text: "what does trample do?", hasDeckContext: false }));
assert.strictEqual(whatTrample.mode, "MINI_ONLY");

const commanderTax = layer0Decide(base({ text: "commander tax?", hasDeckContext: false }));
assert.strictEqual(commanderTax.mode, "MINI_ONLY");

const bestCommanderZombies = layer0Decide(base({ text: "what's the best commander for zombies?", hasDeckContext: false }));
assert.strictEqual(bestCommanderZombies.mode, "MINI_ONLY");
assert.strictEqual((bestCommanderZombies as any).reason, "simple_one_liner_no_deck");

const nearCapSimple = layer0Decide(base({ text: "what is first strike?", hasDeckContext: false, nearBudgetCap: true }));
assert.strictEqual(nearCapSimple.mode, "MINI_ONLY");

// --- layer0Decide: FULL_LLM cases ---
const analyzeWithDeck = layer0Decide(base({ text: "analyze my deck", hasDeckContext: true }));
assert.strictEqual(analyzeWithDeck.mode, "FULL_LLM");
assert.strictEqual((analyzeWithDeck as any).reason, "deck_context_complex_or_long");

const suggestWithDeck = layer0Decide(base({ text: "suggest improvements", hasDeckContext: true }));
assert.strictEqual(suggestWithDeck.mode, "FULL_LLM");

const synergyWithDeck = layer0Decide(base({ text: "how does synergy work in this list?", hasDeckContext: true }));
assert.strictEqual(synergyWithDeck.mode, "FULL_LLM");

// Must exceed 80 chars to hit "default" (simple_one_liner threshold is 80)
const defaultLong = layer0Decide(base({ text: "Explain in detail the history of Magic the Gathering and its impact on card games worldwide.", hasDeckContext: false }));
assert.strictEqual(defaultLong.mode, "FULL_LLM");
assert.strictEqual((defaultLong as any).reason, "default");

// --- Integration-style: spec scenarios ---
// "analyze my deck" with no deck context returns NO_LLM prompt to provide deck
const spec1 = layer0Decide(base({ text: "analyze my deck", hasDeckContext: false }));
assert.strictEqual(spec1.mode, "NO_LLM");
assert.strictEqual((spec1 as any).handler, "need_more_info");

// Simple rules question uses MINI_ONLY
const spec2 = layer0Decide(base({ text: "what is vigilance?", hasDeckContext: false }));
assert.strictEqual(spec2.mode, "MINI_ONLY");

// Complex deck question with linked summary uses FULL_LLM
const spec3 = layer0Decide(base({ text: "analyze my deck and suggest swaps", hasDeckContext: true }));
assert.strictEqual(spec3.mode, "FULL_LLM");

// LLM_LAYER0=off is not testable here (env in route); we verify that with deck context + complex we get FULL_LLM
const spec4 = layer0Decide(base({ text: "what's wrong with my deck?", hasDeckContext: true }));
assert.strictEqual(spec4.mode, "FULL_LLM");

// ai_usage logs layer0 fields: tested implicitly by route behavior; we just ensure decision has reason
assert.ok((analyzeWithDeck as any).reason);
assert.ok((whatIsWard as any).reason);

// --- Helper predicates ---
assert.strictEqual(isDeckAnalysisRequest("analyze my deck"), true);
assert.strictEqual(isDeckAnalysisRequest("improve this list"), true);
assert.strictEqual(isDeckAnalysisRequest("suggest swaps"), true);
assert.strictEqual(isDeckAnalysisRequest("what is trample"), false);

assert.strictEqual(isSimpleRulesOrTerm("what is ward"), true);
assert.strictEqual(isSimpleRulesOrTerm("what does trample do"), true);
assert.strictEqual(isSimpleRulesOrTerm("commander tax"), true);
assert.strictEqual(isSimpleRulesOrTerm("analyze my deck"), false);

assert.strictEqual(isManaTapFaq("How do I link a deck to chat?"), true);
assert.strictEqual(isManaTapFaq("what does budget swap do"), true);
assert.strictEqual(isManaTapFaq("random question"), false);

assert.strictEqual(needsDeckButMissing("analyze my deck", false), true);
assert.strictEqual(needsDeckButMissing("analyze my deck", true), false);
assert.strictEqual(needsDeckButMissing("what is trample", false), false);

console.log("layer0-gate.test.ts: all assertions passed.");
export {};
