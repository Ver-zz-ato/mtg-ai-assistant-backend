import assert from "node:assert/strict";
import { getCommanderProfileByName } from "@/lib/commanders";
import { formatDeckContextSummaryHint } from "@/lib/deck/commander-generation-context";
import type { DeckContextSummary } from "@/lib/deck/deck-context-summary";

const muldrotha = getCommanderProfileByName("Muldrotha, the Gravetide");
assert.ok(muldrotha, "Muldrotha profile should resolve by name");
assert.ok(muldrotha?.blurb || muldrotha?.coachNotes, "profile should include guide text");

const summary: DeckContextSummary = {
  deck_hash: "test",
  format: "Commander",
  commander: "Muldrotha, the Gravetide",
  colors: ["U", "B", "G"],
  land_count: 36,
  curve_histogram: [0, 0, 0, 0, 0, 0],
  ramp: 10,
  removal: 8,
  draw: 9,
  board_wipes: 2,
  wincons: 3,
  archetype_tags: ["graveyard", "value"],
  warning_flags: [],
  card_names: [],
  card_count: 100,
  last_updated: new Date().toISOString(),
};

const hint = formatDeckContextSummaryHint('Precon "Fungal Funk"', summary);
assert.match(hint, /lands 36/);
assert.match(hint, /ramp 10/);

console.log("commander-generation-context.test.ts: ok");
