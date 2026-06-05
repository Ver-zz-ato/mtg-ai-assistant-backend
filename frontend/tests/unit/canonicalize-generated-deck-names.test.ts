import assert from "node:assert";
import { canonicalizeGeneratedDeckRows } from "@/lib/deck/canonicalize-generated-deck-names";

async function main() {
  const out = await canonicalizeGeneratedDeckRows(
    [
      { name: "Solr Ring", qty: 1 },
      { name: "Forest", qty: 10 },
      { name: "forest", qty: 2 },
      { name: "Unknown Mana Thing", qty: 1 },
    ],
    {
      resolveNameOverride: async (name) => {
        if (name === "Solr Ring") return "Sol Ring";
        if (name.toLowerCase() === "forest") return "Forest";
        return null;
      },
    },
  );

  assert.deepEqual(out.rows, [
    { name: "Sol Ring", qty: 1 },
    { name: "Forest", qty: 12 },
    { name: "Unknown Mana Thing", qty: 1 },
  ]);
  assert.deepEqual(out.changes, [{ from: "Solr Ring", to: "Sol Ring" }]);

  console.log("canonicalize-generated-deck-names.test.ts passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
