import assert from "node:assert";
import {
  filterExplanationBulletsForDeck,
  padMainboardNearSixty,
  padSideboardTowardFifteen,
  parseConstructedAiJsonDetailed,
  unwrapJsonFenceForConstructed,
} from "@/lib/deck/generate-constructed-post";
import { totalDeckQty } from "@/lib/deck/generation-helpers";

const genericFallback = "Solid role alignment with the final card choices for this archetype and format.";

{
  const rows56 = [{ name: "Mountain", qty: 56 }];
  const out = padMainboardNearSixty(rows56, ["R"]);
  assert.equal(totalDeckQty(out.rows), 60);
  assert.equal(out.adjusted, true);
}

{
  const rows54 = [{ name: "Mountain", qty: 54 }];
  const out = padMainboardNearSixty(rows54, ["R"]);
  assert.equal(totalDeckQty(out.rows), 54);
  assert.equal(out.adjusted, false);
}

{
  const mixed56 = [
    { name: "Lightning Bolt", qty: 4 },
    { name: "Mountain", qty: 52 },
  ];
  const out = padMainboardNearSixty(mixed56, ["R"]);
  assert.equal(totalDeckQty(out.rows), 60);
}

{
  const sb13 = Array.from({ length: 13 }, (_, i) => ({ name: `Side Card ${i}`, qty: 1 }));
  assert.equal(totalDeckQty(sb13), 13);
  const out = padSideboardTowardFifteen(sb13);
  assert.equal(totalDeckQty(out.rows), 15);
}

{
  const sb13single = [{ name: "Smash to Smithereens", qty: 13 }];
  const out = padSideboardTowardFifteen(sb13single);
  assert.equal(totalDeckQty(out.rows), 13);
  assert.equal(out.adjusted, false);
}

{
  const deck = [{ name: "Lightning Bolt", qty: 4 }];
  const bullets = ["Lightning Bolt clears small creatures.", "Unknown Fake Card Name wins mirrors."];
  const filtered = filterExplanationBulletsForDeck(bullets, deck);
  assert.ok(filtered.some((b) => b.includes("Lightning Bolt")));
  assert.ok(filtered.some((b) => b === genericFallback));
}

{
  const bad = parseConstructedAiJsonDetailed("{ not json");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.error.length > 0);

  const fence = unwrapJsonFenceForConstructed('```json\n{"x":1}\n```');
  const ok = parseConstructedAiJsonDetailed(fence);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal((ok.data as { x: number }).x, 1);
}

console.log("generate-constructed-post tests OK");
