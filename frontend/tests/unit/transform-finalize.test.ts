import assert from "node:assert/strict";
import { finalizeTransformRows, type QtyRow } from "@/lib/deck/transform-finalize";
import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";

type FakeRow = { legalities?: Record<string, string> | null; color_identity?: string[] | null };

function details(rows: Record<string, FakeRow>): Map<string, FakeRow> {
  return new Map(Object.entries(rows).map(([name, row]) => [normalizeScryfallCacheName(name), row]));
}

async function filterRowsByLegalities(
  rows: QtyRow[],
  userFormat: string,
  opts?: { logPrefix?: string; getDetailsForNamesCachedOverride?: (names: string[]) => Promise<Map<string, FakeRow>> },
) {
  const formatKey = String(userFormat || "").trim().toLowerCase();
  const cardDetails = (await opts?.getDetailsForNamesCachedOverride?.(rows.map((row) => row.name))) ?? new Map<string, FakeRow>();
  const lines: QtyRow[] = [];
  const removed: Array<{ name: string; reason: string }> = [];
  for (const row of rows) {
    const status = cardDetails.get(normalizeScryfallCacheName(row.name))?.legalities?.[formatKey];
    if (status === "legal") lines.push(row);
    else removed.push({ name: row.name, reason: status === "banned" ? "banned" : "not_legal" });
  }
  return { lines, removed };
}

async function main() {
  {
    const cardDetails = details({
      Fury: { legalities: { modern: "banned" } },
      "Dragon's Rage Channeler": { legalities: { modern: "legal" } },
      "Murktide Regent": { legalities: { modern: "legal" } },
      Island: { legalities: { modern: "legal" } },
    });
    const result = await finalizeTransformRows({
      rows: [
        { name: "Fury", qty: 4 },
        { name: "Dragon's Rage Channeler", qty: 4 },
        { name: "Murktide Regent", qty: 4 },
        { name: "Island", qty: 48 },
      ],
      sourceRows: [
        { name: "Fury", qty: 4 },
        { name: "Dragon's Rage Channeler", qty: 4 },
        { name: "Murktide Regent", qty: 4 },
        { name: "Island", qty: 48 },
      ],
      targetCount: 60,
      analyzeFormat: "Modern",
      isCommander: false,
      commanderName: null,
      allowedColors: [],
      getCardDetails: async () => cardDetails,
      filterRowsForFormat: filterRowsByLegalities,
    });

    assert.equal(result.rows.some((row) => row.name === "Fury"), false);
    assert.match(result.warnings.join("\n"), /Final legality check removed 1 card line/);
  }

  {
    const cardDetails = details({
      "Korvold, Fae-Cursed King": { legalities: { commander: "legal" }, color_identity: ["B", "R", "G"] },
      "Vault of Champions": { legalities: { commander: "legal" }, color_identity: ["B", "W"] },
      "Training Center": { legalities: { commander: "legal" }, color_identity: ["U", "R"] },
      "Mayhem Devil": { legalities: { commander: "legal" }, color_identity: ["B", "R"] },
      Forest: { legalities: { commander: "legal" }, color_identity: [] },
    });
    const result = await finalizeTransformRows({
      rows: [
        { name: "Korvold, Fae-Cursed King", qty: 2 },
        { name: "Vault of Champions", qty: 1 },
        { name: "Training Center", qty: 1 },
        { name: "Mayhem Devil", qty: 1 },
        { name: "Forest", qty: 96 },
      ],
      sourceRows: [
        { name: "Korvold, Fae-Cursed King", qty: 1 },
        { name: "Vault of Champions", qty: 1 },
        { name: "Training Center", qty: 1 },
        { name: "Mayhem Devil", qty: 1 },
        { name: "Forest", qty: 96 },
      ],
      targetCount: 100,
      analyzeFormat: "Commander",
      isCommander: true,
      commanderName: "Korvold, Fae-Cursed King",
      allowedColors: ["B", "R", "G"],
      getCardDetails: async () => cardDetails,
      filterRowsForFormat: filterRowsByLegalities,
    });

    assert.equal(result.rows.find((row) => row.name === "Korvold, Fae-Cursed King")?.qty, 1);
    assert.equal(result.rows.some((row) => row.name === "Vault of Champions"), false);
    assert.equal(result.rows.some((row) => row.name === "Training Center"), false);
    assert.match(result.warnings.join("\n"), /Commander row normalized/);
    assert.match(result.warnings.join("\n"), /Final color identity check removed/);
  }

  console.log("transform-finalize: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
