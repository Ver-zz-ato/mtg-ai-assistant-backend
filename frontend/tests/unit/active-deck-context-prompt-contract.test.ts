/**
 * Prompt contract tests for ActiveDeckContext.
 * Focused assertions: prompt block selection based on state.
 * Run: npx tsx tests/unit/active-deck-context-prompt-contract.test.ts
 */
import assert from "node:assert";
import { isAuthoritativeCommander, isAuthoritativeForPrompt } from "@/lib/chat/active-deck-context";
import type { ActiveDeckContext } from "@/lib/chat/active-deck-context";

/** Stream route uses isAuthoritativeForPrompt (includes just-confirmed/just-corrected). */
function wouldInjectAnalyzeBlock(ctx: ActiveDeckContext): boolean {
  return !!ctx.hasDeck && isAuthoritativeForPrompt(ctx) && !!ctx.commanderName;
}

function wouldInjectConfirmBlock(ctx: ActiveDeckContext): boolean {
  return !!ctx.hasDeck && ctx.askReason === "confirm_inference" && !!ctx.commanderName;
}

function wouldInjectAskCommanderBlock(ctx: ActiveDeckContext): boolean {
  return !!ctx.hasDeck && ctx.askReason === "need_commander";
}

// Authoritative + deck exists → analyze, NOT ask for deck
const authoritativeCtx: ActiveDeckContext = {
  hasDeck: true,
  source: "linked",
  deckId: "d1",
  commanderName: "Azusa",
  commanderStatus: "confirmed",
  commanderCandidates: [],
  decklistText: "1 Azusa\n1 Sol Ring",
  decklistHash: "x",
  isFullDecklist: false,
  shouldAskCommanderConfirmation: false,
  shouldAskForDeck: false,
  askReason: null,
  inferredCommanderFromCurrentTurn: null,
  userJustConfirmedCommander: false,
  userJustCorrectedCommander: false,
  linkedDeckTakesPriority: true,
  parseWarnings: [],
  deckReplacedByHashChange: false,
  debug: { resolutionPath: [] },
};
assert.strictEqual(wouldInjectAnalyzeBlock(authoritativeCtx), true);
assert.strictEqual(wouldInjectConfirmBlock(authoritativeCtx), false);
assert.strictEqual(wouldInjectAskCommanderBlock(authoritativeCtx), false);
assert.ok(!authoritativeCtx.shouldAskForDeck, "should NOT ask for deck when authoritative commander");

// Inferred commander (not yet confirmed) → confirmation block, no analysis yet
const inferredCtx: ActiveDeckContext = {
  ...authoritativeCtx,
  commanderStatus: "inferred",
  askReason: "confirm_inference",
  shouldAskCommanderConfirmation: true,
};
assert.strictEqual(wouldInjectAnalyzeBlock(inferredCtx), false);
assert.strictEqual(wouldInjectConfirmBlock(inferredCtx), true);

// User just confirmed (same turn) → analyze block (CRITICAL), NOT confirm block; persist immediately
const justConfirmedCtx: ActiveDeckContext = {
  ...inferredCtx,
  userJustConfirmedCommander: true,
};
assert.strictEqual(wouldInjectAnalyzeBlock(justConfirmedCtx), true, "must inject CRITICAL when user just confirmed");

// User just corrected (same turn) → analyze block; persist corrected commander
const justCorrectedCtx: ActiveDeckContext = {
  ...inferredCtx,
  commanderName: "Titania, Protector of Argoth",
  commanderStatus: "corrected",
  userJustCorrectedCommander: true,
};
assert.strictEqual(wouldInjectAnalyzeBlock(justCorrectedCtx), true);

// Missing commander → ask for commander, not analysis
const missingCtx: ActiveDeckContext = {
  ...authoritativeCtx,
  commanderName: null,
  commanderStatus: "missing",
  askReason: "need_commander",
};
assert.strictEqual(wouldInjectAnalyzeBlock(missingCtx), false);
assert.strictEqual(wouldInjectConfirmBlock(missingCtx), false);
assert.strictEqual(wouldInjectAskCommanderBlock(missingCtx), true);

// No deck → no deck-specific blocks (prompt does not pretend deck exists)
const noDeckCtx: ActiveDeckContext = {
  ...authoritativeCtx,
  hasDeck: false,
  commanderName: null,
  commanderStatus: "missing",
  askReason: "need_deck",
};
assert.strictEqual(wouldInjectAnalyzeBlock(noDeckCtx), false);
assert.strictEqual(wouldInjectConfirmBlock(noDeckCtx), false);
assert.strictEqual(noDeckCtx.askReason, "need_deck");

console.log("active-deck-context-prompt-contract.test.ts: all tests passed");
