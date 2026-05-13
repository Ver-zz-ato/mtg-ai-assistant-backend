import assert from "node:assert";
import { parseLocalGameCommand } from "@/lib/voice/local-command-parser";
import { actionType, assessConfirmationNeed, shouldSkipTtsForResponse } from "@/lib/voice/response-policy";

const gameContext = {
  screen: "game",
  voiceMode: "commands_only",
  selfPlayerId: "p2",
  noTtsForCommands: true,
  players: [
    { id: "p1", name: "Player One" },
    { id: "p2", name: "DavyDraws7" },
    { id: "p3", name: "Player Three" },
  ],
};

function buildContract(transcript: string) {
  const parsed = parseLocalGameCommand(transcript, gameContext);
  assert.ok(parsed, "expected local command parser to produce a command");

  const confirmation = assessConfirmationNeed(parsed.actions, {
    ambiguousTarget: parsed.ambiguous_target,
  });

  const mode = confirmation.required ? "clarify" : "game_action";
  const actions = confirmation.required ? [] : parsed.actions;
  const pending_actions = confirmation.required ? parsed.actions : undefined;

  return {
    mode,
    actions,
    pending_actions,
    confirmation_required: confirmation.required || undefined,
    confirmation_reason: confirmation.reason ?? undefined,
    local_parser_hit: parsed.local_parser_hit,
    tts_skipped: shouldSkipTtsForResponse(gameContext, mode),
    analytics: {
      "voice.mode": mode,
      "voice.local_parser_hit": parsed.local_parser_hit,
      "voice.action_type": actionType(actions.length ? actions : pending_actions),
      "voice.clarify_reason": confirmation.reason,
      "voice.confirmation_required": confirmation.required,
      "voice.confirmation_reason": confirmation.reason,
    },
  };
}

const playerOrderContract = buildContract("remove 2 hp from player 1");
assert.deepEqual(playerOrderContract.actions, [
  { action: "adjust_life", target: "p1", amount: -2 },
]);
assert.equal(playerOrderContract.mode, "game_action");
assert.equal(playerOrderContract.local_parser_hit, true);
assert.equal(playerOrderContract.tts_skipped, true);
assert.equal(playerOrderContract.analytics["voice.mode"], "game_action");
assert.equal(playerOrderContract.analytics["voice.action_type"], "adjust_life");

const poisonContract = buildContract("add 5 poison to player 3");
assert.deepEqual(poisonContract.actions, [
  { action: "adjust_counter", target: "p3", counter: "poison", amount: 5 },
]);

const dangerContract = buildContract("set player 1 to 0");
assert.equal(dangerContract.mode, "clarify");
assert.equal(dangerContract.confirmation_required, true);
assert.equal(dangerContract.confirmation_reason, "life_zero");
assert.deepEqual(dangerContract.actions, []);
assert.deepEqual(dangerContract.pending_actions, [
  { action: "set_life", target: "p1", value: 0 },
]);
assert.equal(dangerContract.analytics["voice.clarify_reason"], "life_zero");

console.log("voice-route-contract.test.ts passed");
