export type ParsedRow = { name: string; qty: number; [k: string]: any };
export type ParseReport = {
  totalLines: number;
  parsed: number;
  duplicatesCollapsed: number;
  errors: string[];
};

const BOM = /^\ufeff/;

function normName(s: string): string {
  return s.replace(BOM, '').replace(/[“”]/g, '"').replace(/[’]/g, "'").trim();
}

export function parseCollectionCsvText(text: string): { rows: ParsedRow[]; report: ParseReport } {
  const errors: string[] = [];
  const counts: Record<string, ParsedRow> = {};
  let total = 0;
  let parsed = 0;

  const lines = text.split(/\r?\n/);
  const header = lines[0]?.toLowerCase();
  const hasHeader = /name/.test(header) && /qty|count/.test(header);

  const startIdx = hasHeader ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;
    total++;

    let name = "";
    let qty = 1;
    let rest: any = {};

    const csv = raw.split(/,(?![^"]*\")/).map(s => s.trim()); // naive CSV split without breaking quotes
    if (hasHeader && csv.length >= 2) {
      // header-based
      const cols = header.split(",").map(s => s.trim());
      const map: any = {};
      for (let j = 0; j < Math.min(cols.length, csv.length); j++) {
        map[cols[j]] = csv[j].replace(/^\"|\"$/g, "");
      }
      name = normName(map["name"] || "");
      qty = Number(map["qty"] || map["count"] || 1);
      rest = map;
    } else {
      // loose formats: "2 Arcane Signet" OR "2, Arcane Signet" OR "Arcane Signet,2"
      const loose = raw.replace(/\s+/g, " ").trim();
      let m = loose.match(/^(\d+)\s+(.+)$/);
      if (!m && csv.length === 2) {
        const a = csv[0], b = csv[1];
        if (/^\d+$/.test(a)) m = [raw, a, b];
        else if (/^\d+$/.test(b)) m = [raw, b, a];
      }
      if (m) {
        qty = Number(m[1]);
        name = normName(m[2]);
      } else {
        name = normName(loose);
        qty = 1;
      }
    }

    if (!name) { errors.push(`Line ${i+1}: missing name`); continue; }
    if (!Number.isFinite(qty) || qty < 1) qty = 1;

    const key = name.toLowerCase();
    if (!counts[key]) {
      counts[key] = { name, qty, ...rest };
    } else {
      counts[key].qty += qty;
    }
    parsed++;
  }

  const rows = Object.values(counts);
  const duplicatesCollapsed = parsed - rows.reduce((s, r) => s + (r.qty > 0 ? 1 : 0), 0);

  return {
    rows,
    report: { totalLines: total, parsed, duplicatesCollapsed, errors }
  };
}
