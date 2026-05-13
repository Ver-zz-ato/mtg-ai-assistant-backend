import assert from "node:assert";
import { parseLocalGameCommand } from "@/lib/voice/local-command-parser";
import { validateActions } from "@/lib/voice/validate";

const ctx = {
  selfPlayerId: "p2",
  players: [
    { id: "p1", name: "Sarah" },
    { id: "p2", name: "DavyDraws7" },
    { id: "p3", name: "Nora" },
  ],
};

const loseLife = parseLocalGameCommand("remove 2 hp from player 1", ctx);
assert.deepEqual(loseLife?.actions, [{ action: "adjust_life", target: "p1", amount: -2 }]);
assert.equal(loseLife?.spoken_confirmation, "Removed 2 life");

const addPoisonBySeat = parseLocalGameCommand("add 5 poison to player 3", ctx);
assert.deepEqual(addPoisonBySeat?.actions, [
  { action: "adjust_counter", target: "p3", counter: "poison", amount: 5 },
]);

const toxicByFullHandle = parseLocalGameCommand("add 3x toxic to DavyDraws7", ctx);
assert.deepEqual(toxicByFullHandle?.actions, [
  { action: "adjust_counter", target: "p2", counter: "poison", amount: 3 },
]);

const toxicByNickname = parseLocalGameCommand("add 3 toxic to Davy", ctx);
assert.deepEqual(toxicByNickname?.actions, [
  { action: "adjust_counter", target: "p2", counter: "poison", amount: 3 },
]);

const llmStyleToxic = validateActions(
  [{ action: "adjust_counter", target: "Davy", counter: "toxic", amount: 3 }],
  ctx
);
assert.deepEqual(llmStyleToxic, [
  { action: "adjust_counter", target: "p2", counter: "poison", amount: 3 },
]);

const setLifeByNickname = validateActions([{ action: "set_life", target: "Davy", value: 23 }], ctx);
assert.deepEqual(setLifeByNickname, [{ action: "set_life", target: "p2", value: 23 }]);

console.log("voice-command-parser.test.ts passed");
