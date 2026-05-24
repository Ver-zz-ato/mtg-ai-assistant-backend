import test from "node:test";
import assert from "node:assert/strict";
import { parseDeckChangeIntent } from "../../lib/chat/deck-actions";

test("parseDeckChangeIntent supports remove with quantity", () => {
  assert.deepEqual(parseDeckChangeIntent("remove 1 sol ring"), [
    { type: "remove", name: "sol ring", qty: 1, zone: "mainboard" },
  ]);
  assert.deepEqual(parseDeckChangeIntent("remove 1 Sol Ring from the deck"), [
    { type: "remove", name: "Sol Ring", qty: 1, zone: "mainboard" },
  ]);
});
