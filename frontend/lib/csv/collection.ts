import { parseDeckOrCollectionCSV } from "./parse";

export type ParsedRow = { name: string; qty: number; [k: string]: any };
export type ParseReport = {
  totalLines: number;
  parsed: number;
  duplicatesCollapsed: number;
  errors: string[];
  detectedFormat?: string;
};

const BOM = /^\ufeff/;

function normName(s: string): string {
  const unified = s.replace(BOM, "")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2019\u2018]/g, "'");
  const nfkc = (unified as any).normalize ? unified.normalize("NFKC") : unified;
  return nfkc.replace(/^"|"$/g, "").replace(/\s+/g, " ").trim();
}

function detectFormat(header: string): string {
  const lower = header.toLowerCase();

  if (lower.includes("tcgplayer id") || (lower.includes("product name") && lower.includes("set name"))) {
    return "tcgplayer";
  }
  if ((lower.includes("edition") && lower.includes("qty")) || lower.includes("card kingdom")) {
    return "cardkingdom";
  }
  if (lower.includes("tradelist count") || (lower.includes("collector number") && lower.includes("edition") && lower.includes("tags"))) {
    return "moxfield";
  }
  if (lower.includes("alter") && lower.includes("signed") && lower.includes("card")) {
    return "archidekt";
  }
  if (/name/.test(lower) && /qty|count|quantity|quantityx/.test(lower)) {
    return "generic-header";
  }

  return "loose-format";
}

export function parseCollectionCsvText(text: string): { rows: ParsedRow[]; report: ParseReport } {
  const lines = text.split(/\r?\n/);
  const nonEmptyLines = lines.filter((line) => line.trim());
  const detectedFormat = detectFormat(nonEmptyLines[0] || "");
  const rows = parseDeckOrCollectionCSV(text).map((row) => ({
    name: normName(row.name),
    qty: row.qty,
  }));

  return {
    rows,
    report: {
      totalLines: nonEmptyLines.length,
      parsed: rows.length,
      duplicatesCollapsed: Math.max(0, nonEmptyLines.length - rows.length - (nonEmptyLines.length > rows.length ? 1 : 0)),
      errors: [],
      detectedFormat,
    },
  };
}
