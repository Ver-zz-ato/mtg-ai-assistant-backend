import assert from "node:assert/strict";
import { countAiWorkshopDeckCards } from "@/lib/deck/ai-workshop-deck-text";
import {
  enrichSavedDeckRow,
  filterEligibleSavedDecks,
  getAiDeckHalfwayMinimumCards,
  isSavedDeckEligibleForTools,
} from "@/lib/deck/tool-deck-eligibility";

async function main() {
  assert.equal(getAiDeckHalfwayMinimumCards("Commander"), 50);
  assert.equal(isSavedDeckEligibleForTools(49, "Commander"), false);
  assert.equal(isSavedDeckEligibleForTools(50, "Commander"), true);
  assert.equal(isSavedDeckEligibleForTools(29, "Modern"), false);
  assert.equal(isSavedDeckEligibleForTools(30, "Pioneer"), true);

  const commanderText = Array.from({ length: 50 }, (_, i) => `1 Card ${i + 1}`).join("\n");
  const smallText = Array.from({ length: 10 }, (_, i) => `1 Card ${i + 1}`).join("\n");
  assert.equal(countAiWorkshopDeckCards(commanderText, "Commander"), 50);

  const big = enrichSavedDeckRow({
    id: "a",
    title: "Big",
    format: "Commander",
    deck_text: commanderText,
  });
  const small = enrichSavedDeckRow({
    id: "b",
    title: "Small",
    format: "Commander",
    deck_text: smallText,
  });
  assert.ok(big);
  assert.ok(small);
  const filtered = filterEligibleSavedDecks([big!, small!]);
  assert.equal(filtered.eligible.length, 1);
  assert.equal(filtered.eligible[0]?.id, "a");
  assert.equal(filtered.hiddenCount, 1);

  console.log("tool-deck-eligibility tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
