/**
 * Supplemental keyword tagging in `lib/deck/card-role-tags.ts` (additive; source `keywords`).
 * Run: npx tsx tests/unit/card-role-tags-keyword.test.ts
 */
import assert from "node:assert";
import { tagCard, type TaggedCard } from "@/lib/deck/card-role-tags";
import type { EnrichedCard } from "@/lib/deck/deck-enrichment";

function kwCase(
  keywords: string[],
  oracle: string,
  typeLine: string,
  cmc: number
): TaggedCard {
  return tagCard({
    name: "Fixture",
    qty: 1,
    type_line: typeLine,
    oracle_text: oracle,
    cmc,
    keywords,
  } as EnrichedCard);
}

{
  const t = kwCase(["Landfall"], "", "Creature — Elemental", 4);
  const k = t.tags.find((x) => x.source === "keywords" && x.tag === "payoff");
  assert.ok(k, "expected Landfall keyword to add payoff when oracle heuristics miss");
  assert.strictEqual(k?.confidence, 0.52);
}

{
  const t = kwCase(["Landfall"], "", "Land", 0);
  assert.ok(!t.tags.some((x) => x.tag === "payoff"), "landfall on lands should not add payoff supplement");
}

{
  const t = kwCase(["Flashback"], "", "Instant", 2);
  const k = t.tags.find((x) => x.source === "keywords" && x.tag === "graveyard_setup");
  assert.ok(k, "expected Flashback to add graveyard_setup when recursion rules miss");
}

{
  const t = kwCase(["Populate"], "", "Sorcery", 4);
  assert.ok(t.tags.some((x) => x.source === "keywords" && x.tag === "token_payoff"));
}

{
  const t = kwCase(["Fabricate"], "", "Artifact Creature — Construct", 3);
  assert.ok(t.tags.some((x) => x.source === "keywords" && x.tag === "token_producer"));
}

console.log("OK card-role-tags-keyword");
