import { cleanCardName } from "@/lib/deck/cleanCardName";

export type QtyRow = { name: string; qty: number };

export type TransformRules = {
  maxChanges: number | null;
  preserveCommanderPackage: boolean;
  lockManaBase: boolean;
  onlyChangeNonlands: boolean;
  preserveCards: string[];
  avoidCards: string[];
};

export type EnforcementResult = {
  rows: QtyRow[];
  warnings: string[];
};

type EnforcementArgs = {
  sourceRows: QtyRow[];
  resultRows: QtyRow[];
  targetCount: number;
  rules: TransformRules;
  isCommander: boolean;
  commanderName: string | null;
  transformIntent: string;
  budget: string;
  priceByName?: Map<string, number>;
};

function normName(name: string): string {
  return cleanCardName(String(name || ""))
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeLandName(name: string): boolean {
  const lowerName = name.trim().toLowerCase();
  return /\b(plains|island|swamp|mountain|forest)\b/.test(lowerName)
    || /triome|catacomb|sanctuary|fetch|passage|expanse|wilds|tower|garden|grave|marsh|coast|vista|pathway|citadel|palace|quarters|headquarters|ruins|mesa|delta|strand|heath|foothills|foundry|crypt|harbor|sanctum|temple|panorama|orchard|citadel|vantage|canyon|garrison|sanctuary/.test(lowerName);
}

export function looksLikeManaSupportCard(name: string): boolean {
  const lowerName = name.trim().toLowerCase();
  if (looksLikeLandName(name)) return true;
  return /signet|talisman|sol ring|arcane signet|fellwar stone|mind stone|coldsteel heart|commander's sphere|chromatic lantern|wayfarer's bauble|thought vessel|coalition relic|cultivate|kodama's reach|nature's lore|three visits|farseek|rampant growth|sakura-tribe elder|harrow|birds of paradise|llanowar elves|elvish mystic|arbor elf|utopia sprawl|wild growth|skyshroud claim|migration path|circuitous route|astral cornucopia/.test(lowerName);
}

function looksLikeBasicLandName(name: string): boolean {
  return /^(plains|island|swamp|mountain|forest|wastes)$/i.test(name.trim());
}

function looksLikeInteractionCard(name: string): boolean {
  const lowerName = name.trim().toLowerCase();
  return /swords to plowshares|path to exile|beast within|generous gift|chaos warp|pongify|rapid hybridization|reality shift|counterspell|swan song|arcane denial|negate|spell pierce|dovin's veto|mana drain|force of will|fierce guardianship|deflecting swat|heroic intervention|teferi's protection|boros charm|wear \/\/ tear|abrade|feed the swarm|go for the throat|fatal push|infernal grasp|vindicate|anguished unmaking|assassin's trophy|decimate|vandalblast|austere command|toxic deluge|cyclonic rift|grave pact|plaguecrafter|haywire mite|caustic caterpillar|seal of primordium|rest in peace|grafdigger's cage|damping sphere|collector ouphe/.test(lowerName)
    || /\b(counter|destroy|exile|remove|removal|protection|protect|hexproof|indestructible|ward|wipe|wrath|sweeper|hate|stax|silence)\b/.test(lowerName);
}

export function looksLikeSpikyCasualProblemCard(name: string): boolean {
  const lowerName = name.trim().toLowerCase();
  return /mana crypt|jeweled lotus|mox diamond|chrome mox|lion's eye diamond|grim monolith|demonic tutor|vampiric tutor|imperial seal|enlightened tutor|mystical tutor|worldly tutor|diabolic intent|protean hulk|phyrexian altar|ashnod's altar|thassa's oracle|demonic consultation|tainted pact|underworld breach|ad nauseam|dockside extortionist|winter orb|static orb|trinisphere|stasis|drannith magistrate|opposition agent|hullbreacher/.test(lowerName);
}

function sourceLandCountLooksBroken(sourceRows: QtyRow[], targetCount: number, isCommander: boolean): boolean {
  const lands = sourceRows.reduce((sum, row) => sum + (looksLikeLandName(row.name) ? row.qty : 0), 0);
  if (isCommander || targetCount >= 90) return lands < 30 || lands > 45;
  return lands < 16 || lands > 30;
}

export function constructedGeneralLandCountLooksSeverelyBroken(sourceRows: QtyRow[]): boolean {
  const lands = sourceRows.reduce((sum, row) => sum + (looksLikeLandName(row.name) ? row.qty : 0), 0);
  return lands < 14 || lands > 34;
}

function rowMap(rows: QtyRow[]): Map<string, { name: string; qty: number }> {
  const out = new Map<string, { name: string; qty: number }>();
  for (const row of rows) {
    const key = normName(row.name);
    const existing = out.get(key);
    if (existing) existing.qty += row.qty;
    else out.set(key, { name: row.name, qty: row.qty });
  }
  return out;
}

export function diffRows(beforeRows: QtyRow[], afterRows: QtyRow[]) {
  const before = rowMap(beforeRows);
  const after = rowMap(afterRows);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const added: QtyRow[] = [];
  const removed: QtyRow[] = [];
  for (const key of keys) {
    const beforeQty = before.get(key)?.qty ?? 0;
    const afterQty = after.get(key)?.qty ?? 0;
    const name = after.get(key)?.name ?? before.get(key)?.name ?? key;
    if (afterQty > beforeQty) added.push({ name, qty: afterQty - beforeQty });
    if (beforeQty > afterQty) removed.push({ name, qty: beforeQty - afterQty });
  }
  return { added, removed };
}

function totalDeckQty(rows: QtyRow[]): number {
  return rows.reduce((sum, row) => sum + Math.max(0, row.qty || 0), 0);
}

function normalizeRows(rows: QtyRow[]): QtyRow[] {
  return rows.filter((row) => row.qty > 0 && row.name.trim().length > 0);
}

function toWorkingEntries(rows: QtyRow[]) {
  return rows.map((row, index) => ({ key: normName(row.name), name: row.name, qty: row.qty, sourceIndex: index }));
}

function fromWorkingEntries(entries: Array<{ key: string; name: string; qty: number; sourceIndex: number }>): QtyRow[] {
  return normalizeRows(entries.map(({ name, qty }) => ({ name, qty })));
}

function findEntry(
  entries: Array<{ key: string; name: string; qty: number; sourceIndex: number }>,
  key: string,
) {
  return entries.find((entry) => entry.key === key);
}

function sourceOrderMap(rows: QtyRow[]): Map<string, number> {
  return new Map(rows.map((row, index) => [normName(row.name), index]));
}

function priceFor(name: string, priceByName?: Map<string, number>): number {
  return priceByName?.get(normName(name)) ?? 0;
}

function budgetAddedCardCap(budget: string): number | null {
  const normalized = budget.trim().toLowerCase();
  if (normalized === "budget") return 12;
  if (normalized === "moderate") return 35;
  return null;
}

function budgetTotalMultiplier(budget: string, transformIntent: string): number | null {
  const normalized = budget.trim().toLowerCase();
  if (transformIntent === "lower_budget") {
    if (normalized === "high") return 1;
    if (normalized === "moderate") return 0.97;
    return 0.92;
  }
  if (normalized === "budget") return 1;
  if (normalized === "moderate") return 1.15;
  return null;
}

function estimateDeckPrice(rows: QtyRow[], priceByName?: Map<string, number>): number | null {
  if (!priceByName?.size) return null;
  let total = 0;
  let matched = 0;
  for (const row of rows) {
    const price = priceFor(row.name, priceByName);
    if (price > 0) matched += 1;
    total += price * row.qty;
  }
  return matched > 0 ? Number(total.toFixed(2)) : null;
}

function rebalanceToTarget(args: {
  working: Array<{ key: string; name: string; qty: number; sourceIndex: number }>;
  sourceRows: QtyRow[];
  targetCount: number;
  avoidKeys: Set<string>;
  protectedKeys?: Set<string>;
  priceByName?: Map<string, number>;
}) {
  const protectedKeys = args.protectedKeys ?? new Set<string>();
  const sourceMap = rowMap(args.sourceRows);
  const sourceOrder = sourceOrderMap(args.sourceRows);

  while (totalDeckQty(fromWorkingEntries(args.working)) > args.targetCount) {
    const currentRows = fromWorkingEntries(args.working);
    const diff = diffRows(args.sourceRows, currentRows);
    const addRemovalCandidates = diff.added
      .flatMap((row) => Array.from({ length: row.qty }, () => row.name))
      .map((name) => ({
        key: normName(name),
        name,
        sourceIndex: sourceOrder.get(normName(name)) ?? Number.MAX_SAFE_INTEGER,
        price: priceFor(name, args.priceByName),
      }))
      .filter((item) => !protectedKeys.has(item.key))
      .sort((a, b) => b.price - a.price || b.sourceIndex - a.sourceIndex || a.name.localeCompare(b.name));
    const fallbackCandidates = args.working
      .filter((entry) => !protectedKeys.has(entry.key))
      .map((entry) => ({
        key: entry.key,
        name: entry.name,
        sourceIndex: entry.sourceIndex,
        price: priceFor(entry.name, args.priceByName),
      }))
      .sort((a, b) => b.price - a.price || b.sourceIndex - a.sourceIndex || a.name.localeCompare(b.name));
    const candidate = addRemovalCandidates[0] ?? fallbackCandidates[0];
    if (!candidate) break;
    const entry = findEntry(args.working, candidate.key);
    if (!entry) break;
    entry.qty -= 1;
    if (entry.qty <= 0) {
      const index = args.working.indexOf(entry);
      if (index >= 0) args.working.splice(index, 1);
    }
  }

  while (totalDeckQty(fromWorkingEntries(args.working)) < args.targetCount) {
    const currentRows = fromWorkingEntries(args.working);
    const diff = diffRows(args.sourceRows, currentRows);
    const restoreCandidates = diff.removed
      .map((row) => ({
        key: normName(row.name),
        name: row.name,
        sourceIndex: sourceOrder.get(normName(row.name)) ?? Number.MAX_SAFE_INTEGER,
        qty: row.qty,
      }))
      .filter((item) => !args.avoidKeys.has(item.key))
      .sort((a, b) => a.sourceIndex - b.sourceIndex || a.name.localeCompare(b.name));
    const candidate = restoreCandidates[0];
    if (!candidate) break;
    const sourceRow = sourceMap.get(candidate.key);
    if (!sourceRow) break;
    const existing = findEntry(args.working, candidate.key);
    if (existing) existing.qty += 1;
    else args.working.push({ key: candidate.key, name: sourceRow.name, qty: 1, sourceIndex: candidate.sourceIndex });
  }
}

function restoreProtectedCards(args: {
  working: Array<{ key: string; name: string; qty: number; sourceIndex: number }>;
  sourceRows: QtyRow[];
  protectedKeys: Set<string>;
  avoidKeys: Set<string>;
  targetCount: number;
  priceByName?: Map<string, number>;
}) {
  const sourceMap = rowMap(args.sourceRows);
  const sourceOrder = sourceOrderMap(args.sourceRows);
  for (const key of args.protectedKeys) {
    const sourceRow = sourceMap.get(key);
    if (!sourceRow || args.avoidKeys.has(key)) continue;
    const existing = findEntry(args.working, key);
    const currentQty = existing?.qty ?? 0;
    if (currentQty >= sourceRow.qty) continue;
    const addQty = sourceRow.qty - currentQty;
    if (existing) existing.qty += addQty;
    else args.working.push({
      key,
      name: sourceRow.name,
      qty: addQty,
      sourceIndex: sourceOrder.get(key) ?? Number.MAX_SAFE_INTEGER,
    });
  }
  rebalanceToTarget(args);
}

function revertCategoryToSource(args: {
  working: Array<{ key: string; name: string; qty: number; sourceIndex: number }>;
  sourceRows: QtyRow[];
  targetCount: number;
  avoidKeys: Set<string>;
  predicate: (name: string) => boolean;
  warning: string;
}): string | null {
  const sourceMap = rowMap(args.sourceRows);
  const sourceOrder = sourceOrderMap(args.sourceRows);
  let changed = false;

  for (const entry of [...args.working]) {
    if (!args.predicate(entry.name)) continue;
    const sourceQty = sourceMap.get(entry.key)?.qty ?? 0;
    if (entry.qty > sourceQty) {
      entry.qty = sourceQty;
      changed = true;
    }
  }

  args.working.splice(0, args.working.length, ...args.working.filter((entry) => entry.qty > 0));

  for (const sourceRow of args.sourceRows) {
    if (!args.predicate(sourceRow.name)) continue;
    const key = normName(sourceRow.name);
    if (args.avoidKeys.has(key)) continue;
    const existing = findEntry(args.working, key);
    const currentQty = existing?.qty ?? 0;
    if (currentQty < sourceRow.qty) {
      if (existing) existing.qty = sourceRow.qty;
      else args.working.push({
        key,
        name: sourceRow.name,
        qty: sourceRow.qty,
        sourceIndex: sourceOrder.get(key) ?? Number.MAX_SAFE_INTEGER,
      });
      changed = true;
    }
  }

  if (changed) {
    rebalanceToTarget({
      working: args.working,
      sourceRows: args.sourceRows,
      targetCount: args.targetCount,
      avoidKeys: args.avoidKeys,
    });
    return args.warning;
  }
  return null;
}

function limitMaxChanges(args: {
  working: Array<{ key: string; name: string; qty: number; sourceIndex: number }>;
  sourceRows: QtyRow[];
  maxChanges: number;
  targetCount: number;
  avoidKeys: Set<string>;
  protectedKeys: Set<string>;
  priceByName?: Map<string, number>;
}): string | null {
  let changed = false;
  while (true) {
    const currentRows = fromWorkingEntries(args.working);
    const diff = diffRows(args.sourceRows, currentRows);
    const addedTotal = diff.added.reduce((sum, row) => sum + row.qty, 0);
    const removedTotal = diff.removed.reduce((sum, row) => sum + row.qty, 0);
    if (addedTotal <= args.maxChanges && removedTotal <= args.maxChanges) break;
    changed = true;
    rebalanceToTarget({
      working: args.working,
      sourceRows: args.sourceRows,
      targetCount: args.targetCount,
      avoidKeys: args.avoidKeys,
      protectedKeys: args.protectedKeys,
      priceByName: args.priceByName,
    });
    const afterRebalance = diffRows(args.sourceRows, fromWorkingEntries(args.working));
    const addCandidate = afterRebalance.added
      .flatMap((row) => Array.from({ length: row.qty }, () => row.name))
      .map((name) => ({ key: normName(name), name, price: priceFor(name, args.priceByName) }))
      .filter((item) => !args.protectedKeys.has(item.key))
      .sort((a, b) => b.price - a.price || a.name.localeCompare(b.name))[0];
    if (!addCandidate) break;
    const entry = findEntry(args.working, addCandidate.key);
    if (!entry) break;
    entry.qty -= 1;
    if (entry.qty <= 0) {
      const index = args.working.indexOf(entry);
      if (index >= 0) args.working.splice(index, 1);
    }
    rebalanceToTarget({
      working: args.working,
      sourceRows: args.sourceRows,
      targetCount: args.targetCount,
      avoidKeys: args.avoidKeys,
      protectedKeys: args.protectedKeys,
      priceByName: args.priceByName,
    });
  }
  return changed ? `Hard max-changes cap kept the pass within ${args.maxChanges} swaps.` : null;
}

function enforceBudgetRules(args: {
  working: Array<{ key: string; name: string; qty: number; sourceIndex: number }>;
  sourceRows: QtyRow[];
  targetCount: number;
  avoidKeys: Set<string>;
  protectedKeys: Set<string>;
  priceByName?: Map<string, number>;
  budget: string;
  transformIntent: string;
}): string[] {
  const warnings: string[] = [];
  const currentRows = fromWorkingEntries(args.working);
  const diff = diffRows(args.sourceRows, currentRows);
  const perCardCap = budgetAddedCardCap(args.budget);
  if (perCardCap != null) {
    const overCapAdds = diff.added.filter((row) => priceFor(row.name, args.priceByName) > perCardCap);
    if (overCapAdds.length) {
      for (const row of overCapAdds) {
        const entry = findEntry(args.working, normName(row.name));
        if (!entry || args.protectedKeys.has(entry.key)) continue;
        entry.qty = Math.max(0, entry.qty - row.qty);
      }
      args.working.splice(0, args.working.length, ...args.working.filter((entry) => entry.qty > 0));
      rebalanceToTarget(args);
      warnings.push(`Budget guard removed newly added cards priced above about $${perCardCap}.`);
    }
  }

  const sourceTotal = estimateDeckPrice(args.sourceRows, args.priceByName);
  const currentTotal = estimateDeckPrice(fromWorkingEntries(args.working), args.priceByName);
  const totalMultiplier = budgetTotalMultiplier(args.budget, args.transformIntent);
  if (sourceTotal != null && currentTotal != null && totalMultiplier != null) {
    const maxTotal = Number((sourceTotal * totalMultiplier).toFixed(2));
    if (currentTotal > maxTotal) {
      const expensiveAdds = diffRows(args.sourceRows, fromWorkingEntries(args.working)).added
        .flatMap((row) => Array.from({ length: row.qty }, () => row.name))
        .map((name) => ({ key: normName(name), name, price: priceFor(name, args.priceByName) }))
        .filter((item) => !args.protectedKeys.has(item.key))
        .sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
      for (const candidate of expensiveAdds) {
        const nowTotal = estimateDeckPrice(fromWorkingEntries(args.working), args.priceByName);
        if (nowTotal == null || nowTotal <= maxTotal) break;
        const entry = findEntry(args.working, candidate.key);
        if (!entry) continue;
        entry.qty -= 1;
        if (entry.qty <= 0) {
          const index = args.working.indexOf(entry);
          if (index >= 0) args.working.splice(index, 1);
        }
        rebalanceToTarget(args);
      }
      const finalTotal = estimateDeckPrice(fromWorkingEntries(args.working), args.priceByName);
      if (finalTotal != null && finalTotal <= maxTotal) {
        warnings.push(`Budget guard kept estimated deck price around ${args.budget} expectations.`);
      }
    }
  }

  return warnings;
}

function removeAddedRowsWhere(args: {
  working: Array<{ key: string; name: string; qty: number; sourceIndex: number }>;
  sourceRows: QtyRow[];
  targetCount: number;
  avoidKeys: Set<string>;
  protectedKeys: Set<string>;
  priceByName?: Map<string, number>;
  predicate: (name: string) => boolean;
}): boolean {
  let changed = false;
  const diff = diffRows(args.sourceRows, fromWorkingEntries(args.working));
  for (const row of diff.added) {
    if (!args.predicate(row.name)) continue;
    const entry = findEntry(args.working, normName(row.name));
    if (!entry || args.protectedKeys.has(entry.key)) continue;
    entry.qty = Math.max(0, entry.qty - row.qty);
    changed = true;
  }
  if (!changed) return false;
  args.working.splice(0, args.working.length, ...args.working.filter((entry) => entry.qty > 0));
  rebalanceToTarget({
    working: args.working,
    sourceRows: args.sourceRows,
    targetCount: args.targetCount,
    avoidKeys: args.avoidKeys,
    protectedKeys: args.protectedKeys,
    priceByName: args.priceByName,
  });
  return true;
}

function preserveConstructedGeneralIdentity(args: {
  working: Array<{ key: string; name: string; qty: number; sourceIndex: number }>;
  sourceRows: QtyRow[];
  targetCount: number;
  avoidKeys: Set<string>;
  protectedKeys: Set<string>;
  priceByName?: Map<string, number>;
  isCommander: boolean;
}): string | null {
  if (args.isCommander) return null;

  const sourceOrder = sourceOrderMap(args.sourceRows);
  const identityRows = args.sourceRows.filter((row) => {
    if (row.qty < 2) return false;
    if (looksLikeLandName(row.name) || looksLikeManaSupportCard(row.name)) return false;
    return !args.avoidKeys.has(normName(row.name));
  });

  let changed = false;
  for (const sourceRow of identityRows) {
    const key = normName(sourceRow.name);
    args.protectedKeys.add(key);
    const existing = findEntry(args.working, key);
    if ((existing?.qty ?? 0) > 0) continue;
    args.working.push({
      key,
      name: sourceRow.name,
      qty: 1,
      sourceIndex: sourceOrder.get(key) ?? Number.MAX_SAFE_INTEGER,
    });
    changed = true;
  }

  if (!changed) return null;
  rebalanceToTarget({
    working: args.working,
    sourceRows: args.sourceRows,
    targetCount: args.targetCount,
    avoidKeys: args.avoidKeys,
    protectedKeys: args.protectedKeys,
    priceByName: args.priceByName,
  });
  return "General cleanup guard preserved core multi-copy cards to avoid an archetype pivot.";
}

function limitConstructedGeneralUniqueAdds(args: {
  working: Array<{ key: string; name: string; qty: number; sourceIndex: number }>;
  sourceRows: QtyRow[];
  targetCount: number;
  avoidKeys: Set<string>;
  protectedKeys: Set<string>;
  priceByName?: Map<string, number>;
  isCommander: boolean;
  maxUniqueAdds: number;
}): string | null {
  if (args.isCommander) return null;
  const diff = diffRows(args.sourceRows, fromWorkingEntries(args.working));
  if (diff.added.length <= args.maxUniqueAdds) return null;

  const keepKeys = new Set(
    diff.added
      .map((row) => ({ key: normName(row.name), qty: row.qty, price: priceFor(row.name, args.priceByName), name: row.name }))
      .sort((a, b) => b.qty - a.qty || b.price - a.price || a.name.localeCompare(b.name))
      .slice(0, args.maxUniqueAdds)
      .map((row) => row.key),
  );

  let changed = false;
  for (const row of diff.added) {
    const key = normName(row.name);
    if (keepKeys.has(key) || args.protectedKeys.has(key)) continue;
    const entry = findEntry(args.working, key);
    if (!entry) continue;
    entry.qty = Math.max(0, entry.qty - row.qty);
    changed = true;
  }
  if (!changed) return null;
  args.working.splice(0, args.working.length, ...args.working.filter((entry) => entry.qty > 0));
  rebalanceToTarget({
    working: args.working,
    sourceRows: args.sourceRows,
    targetCount: args.targetCount,
    avoidKeys: args.avoidKeys,
    protectedKeys: args.protectedKeys,
    priceByName: args.priceByName,
  });
  return `General cleanup guard limited constructed cleanup to ${args.maxUniqueAdds} new card names.`;
}

function enforceIntentSpecificRules(args: {
  working: Array<{ key: string; name: string; qty: number; sourceIndex: number }>;
  sourceRows: QtyRow[];
  targetCount: number;
  avoidKeys: Set<string>;
  protectedKeys: Set<string>;
  priceByName?: Map<string, number>;
  transformIntent: string;
  isCommander: boolean;
}): string[] {
  const warnings: string[] = [];

  if (args.transformIntent === "improve_mana_base") {
    const warning = revertCategoryToSource({
      working: args.working,
      sourceRows: args.sourceRows,
      targetCount: args.targetCount,
      avoidKeys: args.avoidKeys,
      predicate: (name) => !looksLikeManaSupportCard(name),
      warning: "Mana-base guard reverted unrelated non-mana changes from this pass.",
    });
    if (warning) warnings.push(warning);
  }

  if (args.transformIntent === "tighten_curve") {
    const landCountBroken = sourceLandCountLooksBroken(args.sourceRows, args.targetCount, args.isCommander);
    if (!landCountBroken) {
      const warning = revertCategoryToSource({
        working: args.working,
        sourceRows: args.sourceRows,
        targetCount: args.targetCount,
        avoidKeys: args.avoidKeys,
        predicate: looksLikeLandName,
        warning: "Curve guard preserved the source land count because the mana base did not look broken.",
      });
      if (warning) warnings.push(warning);
    }
  }

  if (args.transformIntent === "add_interaction") {
    const removedNonInteractionAdds = removeAddedRowsWhere({
      ...args,
      predicate: (name) => !looksLikeInteractionCard(name),
    });
    if (removedNonInteractionAdds) warnings.push("Interaction guard removed additions that were not clear answers or protection.");
  }

  if (args.transformIntent === "more_casual") {
    let removedSourcePowerOutliers = false;
    for (const entry of [...args.working]) {
      if (!looksLikeSpikyCasualProblemCard(entry.name)) continue;
      args.avoidKeys.add(entry.key);
      const index = args.working.indexOf(entry);
      if (index >= 0) args.working.splice(index, 1);
      removedSourcePowerOutliers = true;
    }
    if (removedSourcePowerOutliers) {
      rebalanceToTarget({
        working: args.working,
        sourceRows: args.sourceRows,
        targetCount: args.targetCount,
        avoidKeys: args.avoidKeys,
        protectedKeys: args.protectedKeys,
        priceByName: args.priceByName,
      });
      warnings.push("Casual guard removed source fast mana, tutors, combo, or lock pieces before refilling.");
    }

    const removedSpikyAdds = removeAddedRowsWhere({
      ...args,
      predicate: looksLikeSpikyCasualProblemCard,
    });
    if (removedSpikyAdds) warnings.push("Casual guard removed newly added fast mana, tutors, combo, or lock pieces.");
  }

  if (args.transformIntent === "more_optimized") {
    const removedBasicAdds = removeAddedRowsWhere({
      ...args,
      predicate: looksLikeBasicLandName,
    });
    if (removedBasicAdds) warnings.push("Power guard removed basic-land additions that did not improve deck quality.");
  }

  if (args.transformIntent === "general") {
    const landCountBroken = args.isCommander
      ? sourceLandCountLooksBroken(args.sourceRows, args.targetCount, args.isCommander)
      : constructedGeneralLandCountLooksSeverelyBroken(args.sourceRows);
    if (!landCountBroken) {
      const warning = revertCategoryToSource({
        working: args.working,
        sourceRows: args.sourceRows,
        targetCount: args.targetCount,
        avoidKeys: args.avoidKeys,
        predicate: looksLikeLandName,
        warning: "General cleanup guard preserved source lands because the mana base did not look broken.",
      });
      if (warning) warnings.push(warning);
    }

    const identityWarning = preserveConstructedGeneralIdentity(args);
    if (identityWarning) warnings.push(identityWarning);

    const uniqueAddsWarning = limitConstructedGeneralUniqueAdds({
      ...args,
      maxUniqueAdds: 2,
    });
    if (uniqueAddsWarning) warnings.push(uniqueAddsWarning);

    const cleanupMaxChanges = args.isCommander ? 12 : 8;
    const maxWarning = limitMaxChanges({
      working: args.working,
      sourceRows: args.sourceRows,
      maxChanges: cleanupMaxChanges,
      targetCount: args.targetCount,
      avoidKeys: args.avoidKeys,
      protectedKeys: args.protectedKeys,
      priceByName: args.priceByName,
    });
    if (maxWarning) warnings.push(`General cleanup guard limited this pass to ${cleanupMaxChanges} small swaps.`);
  }

  return warnings;
}

function commanderPackageKeys(sourceRows: QtyRow[], commanderName: string | null): Set<string> {
  const protectedKeys = new Set<string>();
  if (commanderName?.trim()) protectedKeys.add(normName(commanderName));
  for (const row of sourceRows) {
    if (looksLikeLandName(row.name) || looksLikeManaSupportCard(row.name)) continue;
    const key = normName(row.name);
    if (protectedKeys.has(key)) continue;
    protectedKeys.add(key);
    if (protectedKeys.size >= (commanderName?.trim() ? 9 : 8)) break;
  }
  return protectedKeys;
}

export function enforceTransformRules(args: EnforcementArgs): EnforcementResult {
  const warnings: string[] = [];
  const working = toWorkingEntries(args.resultRows);
  const avoidKeys = new Set(args.rules.avoidCards.map((name) => normName(name)).filter(Boolean));
  const protectedKeys = new Set<string>();
  for (const name of args.rules.preserveCards) protectedKeys.add(normName(name));

  if (args.rules.onlyChangeNonlands) {
    const warning = revertCategoryToSource({
      working,
      sourceRows: args.sourceRows,
      targetCount: args.targetCount,
      avoidKeys,
      predicate: looksLikeLandName,
      warning: "Only-change-nonlands lock restored land changes to the source deck.",
    });
    if (warning) warnings.push(warning);
  }

  if (args.rules.lockManaBase) {
    const warning = revertCategoryToSource({
      working,
      sourceRows: args.sourceRows,
      targetCount: args.targetCount,
      avoidKeys,
      predicate: looksLikeManaSupportCard,
      warning: "Locked mana base restored land, ramp, and fixing changes to the source deck.",
    });
    if (warning) warnings.push(warning);
  }

  if (protectedKeys.size) {
    restoreProtectedCards({
      working,
      sourceRows: args.sourceRows,
      protectedKeys,
      avoidKeys,
      targetCount: args.targetCount,
      priceByName: args.priceByName,
    });
    warnings.push("Preserve-cards lock restored requested keep cards from the source deck.");
  }

  if (args.rules.preserveCommanderPackage && args.isCommander) {
    const commanderPackage = commanderPackageKeys(args.sourceRows, args.commanderName);
    commanderPackage.forEach((key) => protectedKeys.add(key));
    restoreProtectedCards({
      working,
      sourceRows: args.sourceRows,
      protectedKeys: commanderPackage,
      avoidKeys,
      targetCount: args.targetCount,
      priceByName: args.priceByName,
    });
    warnings.push("Commander-package guard restored the commander and core nonland engine cards from the source deck.");
  }

  if (avoidKeys.size) {
    let removedAvoided = false;
    for (const key of avoidKeys) {
      const entry = findEntry(working, key);
      if (!entry) continue;
      const sourceQty = rowMap(args.sourceRows).get(key)?.qty ?? 0;
      entry.qty = Math.min(entry.qty, sourceQty);
      removedAvoided = true;
    }
    working.splice(0, working.length, ...working.filter((entry) => entry.qty > 0));
    if (removedAvoided) {
      rebalanceToTarget({
        working,
        sourceRows: args.sourceRows,
        targetCount: args.targetCount,
        avoidKeys,
        protectedKeys,
        priceByName: args.priceByName,
      });
      warnings.push("Avoid-cards guard removed exact avoided card names from new changes.");
    }
  }

  warnings.push(
    ...enforceIntentSpecificRules({
      working,
      sourceRows: args.sourceRows,
      targetCount: args.targetCount,
      avoidKeys,
      protectedKeys,
      priceByName: args.priceByName,
      transformIntent: args.transformIntent,
      isCommander: args.isCommander,
    }),
  );

  if (args.rules.maxChanges != null) {
    const warning = limitMaxChanges({
      working,
      sourceRows: args.sourceRows,
      maxChanges: args.rules.maxChanges,
      targetCount: args.targetCount,
      avoidKeys,
      protectedKeys,
      priceByName: args.priceByName,
    });
    if (warning) warnings.push(warning);
  }

  warnings.push(
    ...enforceBudgetRules({
      working,
      sourceRows: args.sourceRows,
      targetCount: args.targetCount,
      avoidKeys,
      protectedKeys,
      priceByName: args.priceByName,
      budget: args.budget,
      transformIntent: args.transformIntent,
    }),
  );

  rebalanceToTarget({
    working,
    sourceRows: args.sourceRows,
    targetCount: args.targetCount,
    avoidKeys,
    protectedKeys,
    priceByName: args.priceByName,
  });

  return {
    rows: fromWorkingEntries(working),
    warnings: [...new Set(warnings)],
  };
}
