import { isCommanderFormatString } from "./formatRules";
import { parseDeckText, parseDeckTextWithZones } from "./parseDeckText";

export type AiWorkshopDeckZone = "mainboard" | "sideboard";

export type AiWorkshopDiffRow = {
  name: string;
  qty: number;
  zone: AiWorkshopDeckZone;
};

export type AiWorkshopBudgetSwapPair = {
  from: string;
  to: string;
  qty?: number;
};

function isCommanderFormat(format: string): boolean {
  return isCommanderFormatString(format);
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function parseRows(deckText: string, format: string): AiWorkshopDiffRow[] {
  if (isCommanderFormat(format)) {
    return parseDeckText(deckText).map((row) => ({
      name: row.name.trim(),
      qty: row.qty || 0,
      zone: "mainboard" as const,
    }));
  }
  return parseDeckTextWithZones(deckText).map((row) => ({
    name: row.name.trim(),
    qty: row.qty || 0,
    zone: row.zone === "sideboard" ? "sideboard" : "mainboard",
  }));
}

function rowKey(row: Pick<AiWorkshopDiffRow, "name" | "zone">): string {
  return `${row.zone}::${normalizeName(row.name)}`;
}

export function countAiWorkshopDeckCards(deckText: string, format: string): number {
  return parseRows(deckText, format)
    .filter((row) => isCommanderFormat(format) || row.zone !== "sideboard")
    .reduce((sum, row) => sum + (row.qty || 0), 0);
}

export function diffAiWorkshopDecklists(beforeText: string, afterText: string, format: string) {
  const toMap = (text: string) => {
    const out = new Map<string, AiWorkshopDiffRow>();
    for (const row of parseRows(text, format)) {
      const key = rowKey(row);
      const prev = out.get(key);
      if (prev) prev.qty += row.qty || 0;
      else out.set(key, { name: row.name, qty: row.qty || 0, zone: row.zone });
    }
    return out;
  };

  const before = toMap(beforeText);
  const after = toMap(afterText);
  const allKeys = new Set([...before.keys(), ...after.keys()]);
  const adds: AiWorkshopDiffRow[] = [];
  const cuts: AiWorkshopDiffRow[] = [];

  for (const key of allKeys) {
    const prev = before.get(key)?.qty ?? 0;
    const next = after.get(key)?.qty ?? 0;
    const diff = next - prev;
    const source = after.get(key) ?? before.get(key);
    if (!source) continue;
    if (diff > 0) adds.push({ name: source.name, qty: diff, zone: source.zone });
    if (diff < 0) cuts.push({ name: source.name, qty: Math.abs(diff), zone: source.zone });
  }

  const sorter = (a: AiWorkshopDiffRow, b: AiWorkshopDiffRow) =>
    a.zone.localeCompare(b.zone) || b.qty - a.qty || a.name.localeCompare(b.name);
  adds.sort(sorter);
  cuts.sort(sorter);
  return { adds, cuts };
}

export function buildAiWorkshopDiffKey(row: AiWorkshopDiffRow): string {
  return `${row.zone}::${normalizeName(row.name)}::${row.qty}`;
}

export function applySelectedAiWorkshopDiffToDeckText(args: {
  baseDeckText: string;
  format: string;
  adds: AiWorkshopDiffRow[];
  cuts: AiWorkshopDiffRow[];
  selectedAddKeys: Set<string>;
  selectedCutKeys: Set<string>;
}): string {
  const map = new Map<string, AiWorkshopDiffRow>();
  for (const row of parseRows(args.baseDeckText, args.format)) {
    const key = rowKey(row);
    const existing = map.get(key);
    if (existing) existing.qty += row.qty || 0;
    else map.set(key, { name: row.name, qty: row.qty || 0, zone: row.zone });
  }

  for (const row of args.cuts) {
    if (!args.selectedCutKeys.has(buildAiWorkshopDiffKey(row))) continue;
    const existing = map.get(rowKey(row));
    if (!existing) continue;
    existing.qty = Math.max(0, existing.qty - row.qty);
    if (existing.qty <= 0) map.delete(rowKey(row));
  }

  for (const row of args.adds) {
    if (!args.selectedAddKeys.has(buildAiWorkshopDiffKey(row))) continue;
    const key = rowKey(row);
    const existing = map.get(key);
    if (existing) existing.qty += row.qty;
    else map.set(key, { name: row.name, qty: row.qty, zone: row.zone });
  }

  const rows = [...map.values()].filter((row) => row.qty > 0);
  const mainboard = rows
    .filter((row) => row.zone !== "sideboard")
    .sort((a, b) => a.name.localeCompare(b.name));
  const sideboard = rows
    .filter((row) => row.zone === "sideboard")
    .sort((a, b) => a.name.localeCompare(b.name));

  const formatRows = (bucket: AiWorkshopDiffRow[]) =>
    bucket.map((row) => `${row.qty} ${row.name}`);

  if (isCommanderFormat(args.format) || sideboard.length === 0) {
    return formatRows(mainboard).join("\n");
  }
  return [...formatRows(mainboard), "Sideboard", ...formatRows(sideboard)].join("\n");
}

export function buildAiWorkshopBudgetSwapKey(pair: Pick<AiWorkshopBudgetSwapPair, "from" | "to">): string {
  return `${normalizeName(pair.from)}=>${normalizeName(pair.to)}`;
}

export function applySelectedAiWorkshopBudgetSwapsToDeckText(args: {
  baseDeckText: string;
  format: string;
  swaps: AiWorkshopBudgetSwapPair[];
  selectedKeys: Set<string>;
}): string {
  const rows = parseRows(args.baseDeckText, args.format);
  const map = new Map<string, AiWorkshopDiffRow>();
  for (const row of rows) {
    const key = rowKey(row);
    const existing = map.get(key);
    if (existing) existing.qty += row.qty || 0;
    else map.set(key, { name: row.name, qty: row.qty || 0, zone: row.zone });
  }

  for (const pair of args.swaps) {
    if (!args.selectedKeys.has(buildAiWorkshopBudgetSwapKey(pair))) continue;
    const qty = Math.max(1, pair.qty ?? 1);
    const fromKeyMain = rowKey({ name: pair.from, zone: "mainboard" });
    const fromKeySide = rowKey({ name: pair.from, zone: "sideboard" });
    const fromRow = map.get(fromKeyMain) ?? map.get(fromKeySide);
    if (!fromRow) continue;
    const zone = fromRow.zone;
    fromRow.qty = Math.max(0, fromRow.qty - qty);
    if (fromRow.qty <= 0) map.delete(rowKey(fromRow));

    const toKey = rowKey({ name: pair.to, zone });
    const existingTo = map.get(toKey);
    if (existingTo) existingTo.qty += qty;
    else map.set(toKey, { name: pair.to, qty, zone });
  }

  const outRows = [...map.values()].filter((row) => row.qty > 0);
  const mainboard = outRows
    .filter((row) => row.zone !== "sideboard")
    .sort((a, b) => a.name.localeCompare(b.name));
  const sideboard = outRows
    .filter((row) => row.zone === "sideboard")
    .sort((a, b) => a.name.localeCompare(b.name));
  const formatRows = (bucket: AiWorkshopDiffRow[]) => bucket.map((row) => `${row.qty} ${row.name}`);

  if (isCommanderFormat(args.format) || sideboard.length === 0) {
    return formatRows(mainboard).join("\n");
  }
  return [...formatRows(mainboard), "Sideboard", ...formatRows(sideboard)].join("\n");
}
