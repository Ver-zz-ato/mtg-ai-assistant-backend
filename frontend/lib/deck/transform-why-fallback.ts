import { diffRows } from "@/lib/deck/transform-enforcement";

type QtyRow = { name: string; qty: number };

export function buildFallbackCardReason(args: {
  bucket: "added" | "removed";
  row: QtyRow;
  transformIntent: string;
}): string {
  const lowerName = args.row.name.trim().toLowerCase();
  const looksLikeLand = /\b(plains|island|swamp|mountain|forest)\b/.test(lowerName)
    || /triome|catacomb|sanctuary|fetch|passage|tower|garden|grave|marsh|coast|vista|pathway|citadel|palace|quarters|headquarters|ruins/.test(lowerName);
  const pass = args.transformIntent;
  if (pass === "improve_mana_base") {
    return args.bucket === "added"
      ? looksLikeLand
        ? "Added to improve mana consistency and color access."
        : "Added to support smoother ramp and mana development."
      : looksLikeLand
        ? "Removed to make room for cleaner fixing."
        : "Removed to free space for better mana support.";
  }
  if (pass === "tighten_curve") {
    return args.bucket === "added"
      ? "Added to make the early game smoother and more efficient."
      : "Removed to cut clunk from the curve.";
  }
  if (pass === "add_interaction") {
    return args.bucket === "added"
      ? "Added to give the deck a cleaner answer package."
      : "Removed to make room for more useful interaction.";
  }
  if (pass === "lower_budget") {
    return args.bucket === "added"
      ? "Added as a cheaper fit for the same overall plan."
      : "Removed to lower the deck's overall cost.";
  }
  if (pass === "more_casual") {
    return args.bucket === "added"
      ? "Added to keep the deck's play pattern a little softer and more table-friendly."
      : "Removed to dial back sharper or swingier play patterns.";
  }
  if (pass === "more_optimized") {
    return args.bucket === "added"
      ? "Added to push consistency and stronger lines of play."
      : "Removed because it was weaker than the upgraded line for this pass.";
  }
  if (pass === "fix_legality") {
    return args.bucket === "added"
      ? "Added as part of the legality repair output."
      : "Removed because it did not meet the format's legality rules.";
  }
  return args.bucket === "added"
    ? "Added to better match the requested refinement goal."
    : "Removed to make room for the requested refinement goal.";
}

export function buildFallbackWhyPayload(args: {
  sourceRows: QtyRow[];
  resultRows: QtyRow[];
  transformIntent: string;
  summary: string;
  commanderName?: string | null;
}): {
  overallWhy: string;
  changeReasons: { added?: Record<string, string>; removed?: Record<string, string> } | null;
} {
  const diff = diffRows(args.sourceRows, args.resultRows);
  if (!diff.added.length && !diff.removed.length) {
    return {
      overallWhy: "No swaps were suggested. This pass kept the working draft as-is because the current list already matched the requested direction closely enough.",
      changeReasons: null,
    };
  }

  const added = Object.fromEntries(
    diff.added.map((row) => [
      row.name.trim().toLowerCase(),
      buildFallbackCardReason({ bucket: "added", row, transformIntent: args.transformIntent }),
    ]),
  );
  const removed = Object.fromEntries(
    diff.removed.map((row) => [
      row.name.trim().toLowerCase(),
      buildFallbackCardReason({ bucket: "removed", row, transformIntent: args.transformIntent }),
    ]),
  );

  const duplicateSummary = args.summary.trim();
  const overallWhy = duplicateSummary && !duplicateSummary.startsWith("Transformed:")
    ? duplicateSummary
    : `This pass applied ${diff.added.length + diff.removed.length} targeted change(s) for ${args.transformIntent.replace(/_/g, " ")}${args.commanderName ? ` around [[${args.commanderName}]]` : ""}.`;

  return {
    overallWhy,
    changeReasons: {
      ...(Object.keys(added).length ? { added } : {}),
      ...(Object.keys(removed).length ? { removed } : {}),
    },
  };
}
