/**
 * Run: npx tsx tests/unit/resolve-thread-deck-id.test.ts
 */
import assert from "node:assert";
import { resolveThreadDeckId } from "@/lib/chat/resolve-thread-deck-id";

assert.deepStrictEqual(resolveThreadDeckId("thread-deck", "other-deck"), {
  deckId: "thread-deck",
  rejectedContextDeckId: true,
});

assert.deepStrictEqual(resolveThreadDeckId("same-id", "same-id"), {
  deckId: "same-id",
  rejectedContextDeckId: false,
});

assert.deepStrictEqual(resolveThreadDeckId(null, "client-only"), {
  deckId: "client-only",
  rejectedContextDeckId: false,
});

assert.deepStrictEqual(resolveThreadDeckId("thread-only", null), {
  deckId: "thread-only",
  rejectedContextDeckId: false,
});

assert.deepStrictEqual(resolveThreadDeckId(null, null), {
  deckId: null,
  rejectedContextDeckId: false,
});

console.log("resolve-thread-deck-id.test.ts: ok");
