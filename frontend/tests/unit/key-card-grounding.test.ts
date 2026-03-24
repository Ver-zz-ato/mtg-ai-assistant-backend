/**
 * Key card grounding helpers — fail-open behavior (no network).
 * Run: npx tsx tests/unit/key-card-grounding.test.ts
 */
import assert from "node:assert";
import { selectKeyCardsForGrounding } from "@/lib/deck/select-key-cards";
import { formatKeyCardsGroundingForPrompt } from "@/lib/deck/key-card-grounding";

(async () => {
  const empty = await selectKeyCardsForGrounding({ cardNames: [] });
  assert.deepStrictEqual(empty, []);

  const nullFmt = await formatKeyCardsGroundingForPrompt([]);
  assert.strictEqual(nullFmt, null);

  console.log("key-card-grounding tests OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
