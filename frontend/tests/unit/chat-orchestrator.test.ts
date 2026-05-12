import assert from "node:assert/strict";
import {
  buildDirectFormatQuestionAnswer,
  encodeChatMetadata,
  looksLikePastedDecklist,
  persistAssistantMessage,
  runChatToolPlanner,
  stripChatMetadata,
} from "../../lib/chat/orchestrator";
import { parseDeckChangeIntent } from "../../lib/chat/deck-actions";
import { isDeckAnalysisRequest } from "../../lib/ai/layer0-gate";

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

  assert.match(
    buildDirectFormatQuestionAnswer({ text: "This is Brawl, not Commander — what's wrong with it?" }) ?? "",
    /Brawl.*60-card/i
  );
  assert.match(
    buildDirectFormatQuestionAnswer({ text: "This is Historic on Arena — do I have too many 1-ofs?" }) ?? "",
    /Historic.*Arena/i
  );
  assert.match(
    buildDirectFormatQuestionAnswer({ text: "I want this to be Modern but I have Mana Crypt." }) ?? "",
    /Mana Crypt.*not legal in Modern/i
  );
  assert.match(
    buildDirectFormatQuestionAnswer({ text: "Here's my 100-card deck with Atraxa at the helm - tell me what's missing." }) ?? "",
    /Commander deck.*100 cards/i
  );

  const pastedList = `analyse this:
1 Maralen, Fae Ascendant
1 Alela, Cunning Conqueror
1 Alchemist's Refuge
1 Arcane Denial
1 Arcane Signet
1 Arbor Elf
1 Beast Within
1 Bitterblossom
1 Bloom Tender
1 Command Tower
1 Counterspell
1 Cyclonic Rift
1 Rhystic Study
1 Sol Ring
1 Umbral Mantle`;

  assert.equal(looksLikePastedDecklist(pastedList), true);
  assert.equal(isDeckAnalysisRequest(pastedList), true);
  assert.equal(
    buildDirectFormatQuestionAnswer({ text: pastedList, format: "Commander" }),
    null,
    "pasted decklists must not trigger Sol Ring legality shortcut"
  );
  const planned = await runChatToolPlanner({
    origin: "https://www.manatap.ai",
    text: pastedList,
    format: "Commander",
  });
  assert.equal(
    planned.some((r) => r.kind === "card_lookup" || r.kind === "legality_check"),
    false,
    "pasted decklists must not be treated as single-card lookup/legality prompts"
  );

  console.log("chat-orchestrator.test.ts passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
