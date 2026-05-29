import assert from "node:assert";
import { shouldSkipTtsForResponse } from "@/lib/voice/response-policy";

assert.equal(
  shouldSkipTtsForResponse(
    {
      voicePrefs: {
        commandFeedback: { playSpokenReply: true },
        questionFeedback: { playSpokenReply: false },
      },
    },
    "game_action"
  ),
  false
);

assert.equal(
  shouldSkipTtsForResponse(
    {
      voicePrefs: {
        commandFeedback: { playSpokenReply: true },
        questionFeedback: { playSpokenReply: false },
      },
    },
    "clarify"
  ),
  true
);

assert.equal(
  shouldSkipTtsForResponse(
    {
      noTtsForCommands: true,
    },
    "game_action"
  ),
  true
);

console.log("voice-response-policy.test.ts passed");
