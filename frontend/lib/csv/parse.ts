// lib/csv/parse.ts
// Minimal CSV/line parser for card lists.
// Accepts CSV with headers: name,qty[,set,collector,foil]
// Or loose lines: "2 Arcane Signet" / "Arcane Signet x2"
export type ParsedItem = { name: string; qty: number };

export function normalizeName(s: string): string {
  return s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

export function parseDeckOrCollectionCSV(input: string): ParsedItem[] {
  const text = input.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");
  // Heuristic: if first line contains comma and "name", treat as CSV
  if (/,/.test(lines[0]) && /name/i.test(lines[0])) {
    const header = lines[0].split(",").map(h => h.trim().toLowerCase());
    const nameIdx = header.indexOf("name");
    const qtyIdx = header.indexOf("qty");
    const out: Record<string, number> = {};
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",");
      const rawName = row[nameIdx] ?? "";
      const rawQty = row[qtyIdx] ?? "1";
      const name = normalizeName(rawName);
      const qty = Math.max(0, Number(String(rawQty).trim()) || 0);
      if (!name || qty <= 0) continue;
      out[name] = (out[name] || 0) + qty;
    }
    return Object.entries(out).map(([name, qty]) => ({ name, qty }));
  }

  // Loose lines
  const out: Record<string, number> = {};
  for (const raw of lines) {
    const line = normalizeName(raw);
    if (!line) continue;
    // Patterns: "2 Card Name" or "Card Name x2"
    let qty = 1;
    let name = line;
    const m1 = line.match(/^(\d+)\s+(.+)$/);
    const m2 = line.match(/^(.+?)\s+x(\d+)$/i);
    if (m1) { qty = Number(m1[1]); name = m1[2]; }
    else if (m2) { name = m2[1]; qty = Number(m2[2]); }
    qty = Math.max(0, Number(qty) || 0);
    if (!name || qty <= 0) continue;
    out[name] = (out[name] || 0) + qty;
  }
  return Object.entries(out).map(([name, qty]) => ({ name, qty }));
}
