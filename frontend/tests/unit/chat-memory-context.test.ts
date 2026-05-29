import assert from "node:assert/strict";
import {
  extractExplicitMemoryCandidate,
  formatDurableMemoriesForPrompt,
  sanitizeClientMemoryContext,
} from "../../lib/chat/chat-context-builder";
import {
  formatSummaryForPrompt,
  normalizeSummary,
  parseSummary,
} from "../../lib/ai/conversation-summary";

function main() {
  const deckMemory = extractExplicitMemoryCandidate("For this deck, please remember that I never want infinite combos.");
  assert.deepEqual(deckMemory, {
    text: "I never want infinite combos",
    scope: "deck",
    memoryType: "constraint",
  });

  const userMemory = extractExplicitMemoryCandidate("please remember that I prefer casual token decks under $80.");
  assert.equal(userMemory?.scope, "user");
  assert.equal(userMemory?.memoryType, "budget_preference");
  assert.equal(userMemory?.text, "I prefer casual token decks under $80");

  assert.equal(extractExplicitMemoryCandidate("I like draw spells"), null);
  assert.equal(extractExplicitMemoryCandidate("remember that my password is hunter2"), null);

  const local = sanitizeClientMemoryContext("<b>Favorite cards:</b> Bitterblossom document.cookie Authorization: Bearer abc");
  assert.equal(local.includes("<b>"), false);
  assert.equal(local.includes("document.cookie"), false);
  assert.equal(local.includes("Authorization:"), false);
  assert.equal(local.includes("Bitterblossom"), true);

  const summary = parseSummary(`Here you go:\n{
    "format": "Commander",
    "commander": "Alela, Cunning Conqueror",
    "deckGoals": ["upgrade faeries", "protect the commander"],
    "constraints": ["no infinite combos"],
    "mentionedCards": ["Bitterblossom", "Kindred Discovery"],
    "durableNotes": ["likes tempo play"]
  }`);
  assert.equal(summary?.commander, "Alela, Cunning Conqueror");
  assert.equal(summary?.deckGoals?.length, 2);

  const normalized = normalizeSummary({
    format: "Commander",
    commander: "Alela, Cunning Conqueror",
    deckGoals: ["upgrade faeries"],
    durableNotes: ["email davy@example.com"],
  });
  assert.equal(normalized?.durableNotes?.length, 0);

  const prompt = formatSummaryForPrompt({
    format: "Commander",
    commander: "Alela, Cunning Conqueror",
    currentFocus: "mana base tuning",
    constraints: ["no infinite combos"],
  });
  assert.equal(prompt.includes("THREAD MEMORY"), true);
  assert.equal(prompt.includes("Alela, Cunning Conqueror"), true);
  assert.equal(prompt.includes("current user message"), true);

  const durablePrompt = formatDurableMemoriesForPrompt([
    { scope: "user", memoryType: "playstyle_preference", text: "Prefers casual tempo decks" },
    { scope: "deck", memoryType: "constraint", text: "Keep Bitterblossom", deckId: "deck-1" },
  ]);
  assert.equal(durablePrompt.includes("SAVED MANATAP MEMORY"), true);
  assert.equal(durablePrompt.includes("this deck/constraint: Keep Bitterblossom"), true);

  console.log("chat-memory-context.test.ts passed");
}

main();
