import assert from "node:assert";
import { resolveFollowUpCommand, resolvePendingClarification } from "@/lib/voice/follow-up";

const context = {
  screen: "game" as const,
  selfPlayerId: "p1",
  players: [
    { id: "p1", name: "DavyDraws7", aliases: ["Davy", "David"] },
    { id: "p2", name: "Forest Fella", aliases: ["Forest"] },
  ],
  pendingClarification: {
    actions: [{ action: "adjust_life", target: "p1", amount: 2 }],
    reason: "ambiguous_target",
    createdAt: Date.now(),
  },
  followUpMemory: {
    lastActions: [{ action: "adjust_life", target: "p1", amount: 1 }],
    lastTargetId: "p1",
    lastSourceId: null,
    createdAt: Date.now(),
  },
};

const yesResult = resolvePendingClarification("yes", context);
assert.equal(yesResult?.outcome, "apply");
assert.deepEqual(yesResult?.actions, [{ action: "adjust_life", target: "p1", amount: 2 }]);

const correctedResult = resolvePendingClarification("no, Forest Fella instead", context);
assert.equal(correctedResult?.outcome, "apply");
assert.deepEqual(correctedResult?.actions, [{ action: "adjust_life", target: "p2", amount: 2 }]);

const andMore = resolveFollowUpCommand("and 2 more", context);
assert.deepEqual(andMore?.actions, [{ action: "adjust_life", target: "p1", amount: 2 }]);

const sameForOtherPlayer = resolveFollowUpCommand("same for Forest", context);
assert.deepEqual(sameForOtherPlayer?.actions, [{ action: "adjust_life", target: "p2", amount: 1 }]);

const undoThat = resolveFollowUpCommand("undo that", context);
assert.deepEqual(undoThat?.actions, [{ action: "undo" }]);

console.log("voice-follow-up.test.ts passed");
