import assert from "node:assert/strict";
import {
  diffRows,
  enforceTransformRules,
  looksLikeLandName,
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

function totalPrice(rows: QtyRow[], priceByName: Map<string, number>): number {
  return rows.reduce((sum, row) => sum + (priceByName.get(row.name.toLowerCase()) ?? 0) * row.qty, 0);
}

function landCount(rows: QtyRow[]): number {
  return rows.reduce((sum, row) => sum + (looksLikeLandName(row.name) ? row.qty : 0), 0);
}

async function main() {
  assert.equal(looksLikeLandName("Evolving Wilds"), true);
  assert.equal(looksLikeLandName("Terramorphic Expanse"), true);

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

  {
    const priceByName = new Map([
      ["steady card", 4],
      ["role player", 4],
      ["upgrade one", 6],
      ["upgrade two", 5],
    ]);
    const source = rows([
      ["Steady Card", 1],
      ["Role Player", 1],
    ]);
    const result = rows([
      ["Upgrade One", 1],
      ["Upgrade Two", 1],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 2,
      rules: baseRules(),
      isCommander: false,
      commanderName: null,
      transformIntent: "general",
      budget: "Budget",
      priceByName,
    });
    assert.ok(totalPrice(enforced.rows, priceByName) <= totalPrice(source, priceByName));
    assert.ok(enforced.rows.some((row) => row.name === "Steady Card" || row.name === "Role Player"));
    assert.ok(
      enforced.rows.some((row) =>
        row.name === "Upgrade One" || row.name === "Upgrade Two" || row.name === "Steady Card" || row.name === "Role Player",
      ),
    );
  }

  {
    const source = rows([
      ["Forest", 8],
      ["Sol Ring", 1],
      ["Cultivate", 1],
      ["Bear Cub", 1],
    ]);
    const result = rows([
      ["Forest", 7],
      ["Command Tower", 1],
      ["Sol Ring", 1],
      ["Cultivate", 1],
      ["Rhystic Study", 1],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 11,
      rules: baseRules(),
      isCommander: true,
      commanderName: "Test Commander",
      transformIntent: "improve_mana_base",
      budget: "Moderate",
    });
    assert.equal(enforced.rows.some((row) => row.name === "Rhystic Study"), false);
    assert.ok(enforced.rows.some((row) => row.name === "Command Tower"));
    assert.ok(enforced.rows.some((row) => row.name === "Bear Cub"));
  }

  {
    const source = rows([
      ["Island", 24],
      ["Opt", 4],
      ["Big Draw Spell", 4],
      ["Role Player", 28],
    ]);
    const result = rows([
      ["Island", 20],
      ["Opt", 4],
      ["Cheap Cantrip", 4],
      ["Role Player", 32],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 60,
      rules: baseRules(),
      isCommander: false,
      commanderName: null,
      transformIntent: "tighten_curve",
      budget: "Moderate",
    });
    assert.equal(landCount(enforced.rows), 24);
  }

  {
    const source = rows([
      ["Island", 20],
      ["Opt", 4],
      ["Role Player", 36],
    ]);
    const result = rows([
      ["Island", 20],
      ["Swords to Plowshares", 4],
      ["Rhystic Study", 4],
      ["Role Player", 32],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 60,
      rules: baseRules(),
      isCommander: false,
      commanderName: null,
      transformIntent: "add_interaction",
      budget: "Moderate",
    });
    assert.ok(enforced.rows.some((row) => row.name === "Swords to Plowshares"));
    assert.equal(enforced.rows.some((row) => row.name === "Rhystic Study"), false);
  }

  {
    const source = rows([
      ["Forest", 36],
      ["Demonic Tutor", 1],
      ["Vampiric Tutor", 1],
      ["Protean Hulk", 1],
      ["Friendly Theme Card", 1],
      ["Role Player", 60],
    ]);
    const result = rows([
      ["Forest", 36],
      ["Mana Crypt", 1],
      ["Demonic Tutor", 1],
      ["Vampiric Tutor", 1],
      ["Protean Hulk", 1],
      ["Role Player", 60],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 100,
      rules: baseRules(),
      isCommander: true,
      commanderName: "Test Commander",
      transformIntent: "more_casual",
      budget: "Moderate",
    });
    assert.equal(enforced.rows.some((row) => row.name === "Mana Crypt"), false);
    assert.equal(enforced.rows.some((row) => row.name === "Demonic Tutor"), false);
    assert.equal(enforced.rows.some((row) => row.name === "Vampiric Tutor"), false);
    assert.equal(enforced.rows.some((row) => row.name === "Protean Hulk"), false);
    assert.ok(enforced.rows.some((row) => row.name === "Friendly Theme Card"));
  }

  {
    const source = rows([
      ["Island", 24],
      ["Role Player", 36],
    ]);
    const result = rows([
      ["Island", 28],
      ["Role Player", 32],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 60,
      rules: baseRules(),
      isCommander: false,
      commanderName: null,
      transformIntent: "more_optimized",
      budget: "Moderate",
    });
    assert.equal(landCount(enforced.rows), 24);
  }

  {
    const source = rows([
      ["Mountain", 22],
      ["Role Player", 38],
    ]);
    const result = rows([
      ["Mountain", 18],
      ["Random Upgrade", 4],
      ["Role Player", 38],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 60,
      rules: baseRules(),
      isCommander: false,
      commanderName: null,
      transformIntent: "general",
      budget: "Moderate",
    });
    assert.equal(landCount(enforced.rows), 22);
  }

  {
    const source = rows([
      ["Island", 20],
      ["Archetype Engine", 4],
      ["Payoff Threat", 4],
      ["Tempo Spell", 4],
      ["Role Player", 28],
    ]);
    const result = rows([
      ["Island", 20],
      ["Generic Upgrade A", 4],
      ["Generic Upgrade B", 4],
      ["Generic Upgrade C", 4],
      ["Generic Upgrade D", 4],
      ["Role Player", 24],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 60,
      rules: baseRules(),
      isCommander: false,
      commanderName: null,
      transformIntent: "general",
      budget: "Moderate",
    });
    const diff = diffRows(source, enforced.rows);
    assert.ok(diff.added.reduce((sum, row) => sum + row.qty, 0) <= 8);
    assert.ok(diff.removed.reduce((sum, row) => sum + row.qty, 0) <= 8);
  }

  {
    const source = rows([
      ["Forest", 22],
      ["Scurry Oak", 4],
      ["Rosie Cotton of South Lane", 4],
      ["Collected Company", 4],
      ["Role Player", 26],
    ]);
    const result = rows([
      ["Forest", 22],
      ["Random Midrange Threat", 4],
      ["Generic Removal", 4],
      ["Generic Draw Spell", 4],
      ["Role Player", 26],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 60,
      rules: baseRules(),
      isCommander: false,
      commanderName: null,
      transformIntent: "general",
      budget: "Moderate",
    });
    assert.ok(enforced.rows.some((row) => row.name === "Scurry Oak" && row.qty > 0));
    assert.ok(enforced.rows.some((row) => row.name === "Rosie Cotton of South Lane" && row.qty > 0));
    assert.ok(enforced.rows.some((row) => row.name === "Collected Company" && row.qty > 0));
  }

  {
    const source = rows([
      ["Forest", 31],
      ["Core Threat", 4],
      ["Core Spell", 4],
      ["Role Player", 21],
    ]);
    const result = rows([
      ["Forest", 29],
      ["New Singleton A", 1],
      ["New Singleton B", 1],
      ["New Singleton C", 1],
      ["New Singleton D", 1],
      ["New Singleton E", 1],
      ["Core Threat", 4],
      ["Core Spell", 4],
      ["Role Player", 17],
    ]);
    const enforced = enforceTransformRules({
      sourceRows: source,
      resultRows: result,
      targetCount: 60,
      rules: baseRules(),
      isCommander: false,
      commanderName: null,
      transformIntent: "general",
      budget: "Moderate",
    });
    const diff = diffRows(source, enforced.rows);
    assert.equal(landCount(enforced.rows), 31);
    assert.ok(diff.added.length <= 2);
  }

  console.log("transform-enforcement: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
