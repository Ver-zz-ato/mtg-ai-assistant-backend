// lib/csv/parse.ts
// Hardened CSV/line parser for card lists (drop-in replacement, same export signature).
// Accepts CSV with headers: name,qty[,set,collector,foil] (header synonyms supported),
// or loose lines: "2 Arcane Signet" / "Arcane Signet x2" / "Arcane Signet ×2" / "Arcane Signet - 2"
// Skips section headings (e.g., LANDS) and comment lines (#, //).
// Normalizes Unicode (NFKC), smart quotes/dashes, and collapses spaces.
// Deduplicates case-insensitively and sums quantities.
export type ParsedItem = { name: string; qty: number };

type AdvancedItem = { name: string; qty: number; set?: string; collector?: string; foil?: boolean };
type ParseReport = { parsed: number; duplicatesCollapsed: number; errors: string[] };

const HEADER_ALIASES: Record<string, "name" | "qty" | "set" | "collector" | "foil" | null> = {
  name: "name",
  card: "name",
  card_name: "name",
  qty: "qty",
  quantity: "qty",
  count: "qty",
  set: "set",
  set_code: "set",
  collector: "collector",
  collector_number: "collector",
  foil: "foil",
};

function normalizeText(input: string): string {
  // NFKC, strip BOM, normalize quotes/dashes/x, collapse spaces/newlines
  let s = input.replace(/^\uFEFF/, "");
  try { s = s.normalize("NFKC"); } catch {}
  s = s
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u00D7\u2715]/g, "x")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n");
  return s.trim();
}

function splitCsvLine(line: string): string[] {
  // CSV split with quote awareness
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === "," && !inQ) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function isHeadingOrComment(line: string): boolean {
  if (!line) return true;
  if (/^\s*(#|\/\/)/.test(line)) return true; // comments
  if (/^\s*(LANDS?|CREATURES?|INSTANTS?|SORCERIES?|ARTIFACTS?|ENCHANTMENTS?|PLANESWALKERS?|SIDEBOARD|MAYBE|COMMANDER)\s*$/i.test(line)) return true;
  return false;
}

// ---- Minimal public API kept for compatibility ----
export function normalizeName(s: string): string {
  return normalizeText(s).replace(/\s+/g, " ").trim();
}

export function parseDeckOrCollectionCSV(input: string): ParsedItem[] {
  const { items } = parseAdvanced(input);
  // Return name/qty only to preserve external contract
  return items.map(i => ({ name: i.name, qty: i.qty }));
}

// ---- Advanced parser (kept internal unless you export) ----
function parseAdvanced(raw: string): { items: AdvancedItem[]; report: ParseReport } {
  const norm = normalizeText(raw);
  if (!norm) return { items: [], report: { parsed: 0, duplicatesCollapsed: 0, errors: [] } };
  const lines = norm.split("\n").map(l => l.trim()).filter(Boolean);

  const report: ParseReport = { parsed: 0, duplicatesCollapsed: 0, errors: [] };
  const items: AdvancedItem[] = [];
  const pushItem = (name: string, qty: number, set?: string, collector?: string, foil?: boolean) => {
    name = (name || "").trim();
    qty = Math.max(0, Number(qty || 0));
    if (!name || !qty) return;
    items.push({ name, qty, set, collector, foil });
  };

  // CSV header detection
  const maybeHeader = splitCsvLine(lines[0]);
  const headerKeys = maybeHeader.map(h => h.toLowerCase().replace(/[^a-z_]/g, ""));
  const hasNameKey = headerKeys.some(k => HEADER_ALIASES[k] === "name");
  const hasQtyKey = headerKeys.some(k => HEADER_ALIASES[k] === "qty");
  const treatAsCsv = maybeHeader.length > 1 && (hasNameKey || hasQtyKey);

  if (treatAsCsv) {
    const map: ("name"|"qty"|"set"|"collector"|"foil"|null)[] = headerKeys.map(k => HEADER_ALIASES[k] ?? null);
    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i];
      if (isHeadingOrComment(raw)) continue;
      const cols = splitCsvLine(raw);
      let name = "", qty = 0, set: string|undefined, collector: string|undefined, foil: boolean|undefined;
      for (let c = 0; c < cols.length && c < map.length; c++) {
        const key = map[c]; const val = cols[c];
        if (key === "name") name = val.replace(/^"|"$/g, "");
        else if (key === "qty") qty = parseInt(val || "0", 10) || 0;
        else if (key === "set") set = val || undefined;
        else if (key === "collector") collector = val || undefined;
        else if (key === "foil") foil = /^(1|true|yes|y)$/i.test(val);
      }
      if (!name) { report.errors.push(`Row ${i+1}: missing name`); continue; }
      pushItem(name, qty || 1, set, collector, foil);
    }
  } else {
    // Loose-line parsing
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isHeadingOrComment(line)) continue;
      // "2 Card Name"
      let m = line.match(/^\s*(\d+)\s+(.+?)\s*$/);
      if (m) { pushItem(m[2], parseInt(m[1], 10)); continue; }
      // "Card Name x2" / "Card Name ×2" / "Card Name - 2"
      m = line.match(/^(.+?)\s*[x\-]\s*(\d+)\s*$/i);
      if (m) { pushItem(m[1], parseInt(m[2], 10)); continue; }
      // "Card Name" => 1
      pushItem(line, 1);
    }
  }

  // Deduplicate case-insensitively
  const dedup: Record<string, AdvancedItem> = {};
  for (const it of items) {
    const key = it.name.toLowerCase();
    if (!dedup[key]) dedup[key] = { ...it };
    else { dedup[key].qty += it.qty; report.duplicatesCollapsed++; }
  }
  const finalItems = Object.values(dedup);
  report.parsed = finalItems.length;
  return { items: finalItems, report };
}
