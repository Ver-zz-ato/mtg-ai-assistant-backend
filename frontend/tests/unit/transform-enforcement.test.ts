import assert from "node:assert/strict";
import {
  diffRows,
  enforceTransformRules,
  type QtyRow,
  type TransformRules,
} from "@/lib/deck/transform-enforcement";

function rows(input: Array<[string, number]>): QtyRow[] {
  return input.map(([name, qty]) => ({ name, qty }));
}

function baseRules(overrides: Partial<TransformRules> = {}): TransformRules {
  return {
    maxChanges: null,
    preserveCommanderPackage: false,
    lockManaBase: false,
    onlyChangeNonlands: false,
    preserveCards: [],
    avoidCards: [],
    ...overrides,
  };
}

async function main() {
  {
    const source = rows([
      ["Command Tower", 1],
      ["Island", 10],
      ["Opt", 1],
    ]);
    const result = rows([
      ["Steam Vents", 1],
      ["Island", 9],
      ["Brainstorm", 1],
      ["Opt", 1],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 12,
      rules: baseRules({ onlyChangeNonlands: true }),
      isCommander: true,
      commanderName: "Test Commander",
      transformIntent: "general",
      budget: "Moderate",
    });
    const diff = diffRows(source, enforced.rows);
    assert.equal(diff.added.some((row) => row.name === "Steam Vents"), false);
    assert.equal(diff.removed.some((row) => row.name === "Command Tower"), false);
  }

  {
    const source = rows([
      ["Forest", 8],
      ["Sol Ring", 1],
      ["Cultivate", 1],
      ["Beast Within", 1],
    ]);
    const result = rows([
      ["Forest", 7],
      ["Mana Crypt", 1],
      ["Nature's Lore", 1],
      ["Beast Within", 1],
      ["Swords to Plowshares", 1],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 11,
      rules: baseRules({ lockManaBase: true }),
      isCommander: true,
      commanderName: "Test Commander",
      transformIntent: "general",
      budget: "Moderate",
    });
    const names = enforced.rows.map((row) => row.name);
    assert.ok(names.includes("Sol Ring"));
    assert.ok(names.includes("Cultivate"));
    assert.equal(names.includes("Mana Crypt"), false);
    assert.equal(names.includes("Nature's Lore"), false);
  }

  {
    const source = rows([
      ["Arcane Signet", 1],
      ["Cyclonic Rift", 1],
      ["Opt", 1],
    ]);
    const result = rows([
      ["Arcane Signet", 1],
      ["Ponder", 1],
      ["Consider", 1],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 3,
      rules: baseRules({ preserveCards: ["Cyclonic Rift"] }),
      isCommander: true,
      commanderName: "Test Commander",
      transformIntent: "general",
      budget: "Moderate",
    });
    assert.ok(enforced.rows.some((row) => row.name === "Cyclonic Rift"));
  }

  {
    const source = rows([
      ["Arcane Signet", 1],
      ["Opt", 1],
      ["Consider", 1],
      ["Brainstorm", 1],
    ]);
    const result = rows([
      ["Arcane Signet", 1],
      ["Ponder", 1],
      ["Preordain", 1],
      ["Serum Visions", 1],
      ["Sleight of Hand", 1],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 4,
      rules: baseRules({ maxChanges: 1 }),
      isCommander: true,
      commanderName: "Test Commander",
      transformIntent: "general",
      budget: "Moderate",
    });
    const diff = diffRows(source, enforced.rows);
    assert.ok(diff.added.reduce((sum, row) => sum + row.qty, 0) <= 1);
    assert.ok(diff.removed.reduce((sum, row) => sum + row.qty, 0) <= 1);
  }

  {
    const source = rows([
      ["Test Commander", 1],
      ["Synergy Engine", 1],
      ["Payoff Card", 1],
      ["Forest", 8],
    ]);
    const result = rows([
      ["Test Commander", 1],
      ["Random Goodstuff", 1],
      ["Forest", 8],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 11,
      rules: baseRules({ preserveCommanderPackage: true }),
      isCommander: true,
      commanderName: "Test Commander",
      transformIntent: "general",
      budget: "Moderate",
    });
    assert.ok(enforced.rows.some((row) => row.name === "Synergy Engine"));
  }

  {
    const source = rows([
      ["Budget Card", 1],
      ["Opt", 1],
      ["Island", 8],
    ]);
    const result = rows([
      ["The One Ring", 1],
      ["Opt", 1],
      ["Island", 8],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 10,
      rules: baseRules(),
      isCommander: true,
      commanderName: "Test Commander",
      transformIntent: "general",
      budget: "Budget",
      priceByName: new Map([
        ["the one ring", 80],
        ["budget card", 1],
        ["opt", 0.2],
        ["island", 0],
      ]),
    });
    assert.equal(enforced.rows.some((row) => row.name === "The One Ring"), false);
    assert.ok(enforced.rows.some((row) => row.name === "Budget Card"));
  }

  console.log("transform-enforcement: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
