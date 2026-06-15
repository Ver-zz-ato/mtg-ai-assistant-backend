import assert from "node:assert/strict";
import { resolveSwapSuggestionsEmptyReason } from "@/lib/deck/swap-suggestions-empty-reason";

async function main() {
  assert.equal(
    resolveSwapSuggestionsEmptyReason({
      useAI: true,
      curatedSourcesInDeck: 0,
      finalCount: 0,
      aiRun: { outcome: "call_failed", rawCount: 0, validatedCount: 0 },
    }),
    "ai_call_failed",
  );

  assert.equal(
    resolveSwapSuggestionsEmptyReason({
      useAI: true,
      curatedSourcesInDeck: 0,
      finalCount: 0,
      aiRun: { outcome: "empty", rawCount: 0, validatedCount: 0 },
    }),
    "ai_no_suggestions",
  );

  assert.equal(
    resolveSwapSuggestionsEmptyReason({
      useAI: true,
      curatedSourcesInDeck: 0,
      finalCount: 0,
      aiRun: { outcome: "ok", rawCount: 3, validatedCount: 0 },
    }),
    "ai_filtered_out",
  );

  assert.equal(
    resolveSwapSuggestionsEmptyReason({
      useAI: false,
      curatedSourcesInDeck: 0,
      finalCount: 0,
      aiRun: { outcome: "not_run", rawCount: 0, validatedCount: 0 },
    }),
    "no_curated_sources_in_deck",
  );

  console.log("swap-suggestions-empty-reason: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
