import assert from "node:assert/strict";
import { encodeChatMetadata, persistAssistantMessage, stripChatMetadata } from "../../lib/chat/orchestrator";
import { parseDeckChangeIntent } from "../../lib/chat/deck-actions";

async function main() {
  const metadata = {
    threadId: "thread-1",
    assistantMessageId: "msg-1",
    persisted: true,
    toolResults: [{ kind: "card_lookup" as const, ok: true, title: "Card lookup", summary: "ok" }],
    pendingDeckAction: null,
  };
  const encoded = `hello${encodeChatMetadata(metadata)}[DONE]`;
  const stripped = stripChatMetadata(encoded.replace("[DONE]", ""));
  assert.equal(stripped.text, "hello");
  assert.deepEqual(stripped.metadata, metadata);

  const inserts: unknown[] = [];
  const fakeSupabase = {
    from(table: string) {
      assert.equal(table, "chat_messages");
      return {
        insert(payload: unknown) {
          inserts.push(payload);
          return {
            select() {
              return {
                maybeSingle: async () => ({ data: { id: "assistant-1" }, error: null }),
              };
            },
          };
        },
      };
    },
  };
  const saved = await persistAssistantMessage(fakeSupabase, {
    threadId: "thread-1",
    content: "answer",
    metadata,
  });
  assert.deepEqual(saved, { id: "assistant-1", persisted: true });
  assert.equal(inserts.length, 1);
  assert.deepEqual(inserts[0], {
    thread_id: "thread-1",
    role: "assistant",
    content: "answer",
    metadata,
  });

  assert.deepEqual(parseDeckChangeIntent("add 2 Lightning Bolt to the deck"), [
    { type: "add", name: "Lightning Bolt", qty: 2, zone: "mainboard" },
  ]);
  assert.deepEqual(parseDeckChangeIntent("remove Sol Ring from sideboard"), [
    { type: "remove", name: "Sol Ring", qty: 1, zone: "sideboard" },
  ]);
  assert.deepEqual(parseDeckChangeIntent("swap Counterspell for Swan Song"), [
    { type: "swap", remove: "Counterspell", add: "Swan Song", qty: 1, zone: "mainboard" },
  ]);

  console.log("chat-orchestrator.test.ts passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
