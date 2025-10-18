export type ParsedRow = { name: string; qty: number; [k: string]: any };
export type ParseReport = {
  totalLines: number;
  parsed: number;
  duplicatesCollapsed: number;
  errors: string[];
  detectedFormat?: string; // Format auto-detection result
};

const BOM = /^\ufeff/;

function normName(s: string): string {
  // Normalize Unicode (NFKC), smart quotes → ASCII, collapse spaces, trim, drop surrounding quotes.
  const BOM = /^\ufeff/;
  const unified = s.replace(BOM, '')
    .replace(/[“”]/g, '"')
    .replace(/[’‘]/g, "'");
  const nfkc = (unified as any).normalize ? unified.normalize("NFKC") : unified;
  return nfkc.replace(/^\"|\"$/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Detect CSV format based on header structure
 */
function detectFormat(header: string): string {
  const lower = header.toLowerCase();
  
  // TCGPlayer format: "Quantity","Product Name","Set Name","Card Number","Condition","TCGplayer Id","Purchase Price"
  if (lower.includes('tcgplayer id') || (lower.includes('product name') && lower.includes('set name'))) {
    return 'tcgplayer';
  }
  
  // CardKingdom format: "Qty","Name","Edition","Condition","Foil"
  if ((lower.includes('edition') && lower.includes('qty')) || lower.includes('card kingdom')) {
    return 'cardkingdom';
  }
  
  // Moxfield format: "Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number","Alter","Proxy","Purchase Price"
  if (lower.includes('tradelist count') || (lower.includes('collector number') && lower.includes('edition') && lower.includes('tags'))) {
    return 'moxfield';
  }
  
  // Archidekt format: "Quantity","Card","Edition","Condition","Language","Foil","Alter","Signed"
  if (lower.includes('alter') && lower.includes('signed') && lower.includes('card')) {
    return 'archidekt';
  }
  
  // Generic with header
  if (/name/.test(lower) && /qty|count|quantity/.test(lower)) {
    return 'generic-header';
  }
  
  return 'loose-format';
}

export function parseCollectionCsvText(text: string): { rows: ParsedRow[]; report: ParseReport } {
  const errors: string[] = [];
  const counts: Record<string, ParsedRow> = {};
  let total = 0;
  let parsed = 0;

  const lines = text.split(/\r?\n/);
  const header = lines[0]?.toLowerCase();
  const hasHeader = /name/.test(header) && /qty|count|quantity|product/.test(header);
  const detectedFormat = detectFormat(header);

  const startIdx = hasHeader ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;
    total++;

    let name = "";
    let qty = 1;
    let rest: any = {};

    const csv = raw.split(/,(?![^"]*")/).map(s => s.trim()); // naive CSV split without breaking quotes
    if (hasHeader && csv.length >= 2) {
      // Recognize synonyms: name|card|card_name, qty|quantity|count, set|set_code, collector|collector_number, foil

      // header-based
      const cols = header.split(",").map(s => s.trim());
      const map: any = {};
      for (let j = 0; j < Math.min(cols.length, csv.length); j++) {
        map[cols[j]] = csv[j].replace(/^\"|\"$/g, "");
      }
      // map keys to lower for easier access
      const lower: any = {}; Object.keys(map).forEach(k => lower[k.toLowerCase()] = map[k]);
      
      // Support various platform-specific column names
      name = normName(
        lower["name"] || 
        lower["card"] || 
        lower["card_name"] || 
        lower["card name"] ||
        lower["product name"] ||
        lower["cardname"] ||
        ""
      );
      qty = Number(
        lower["qty"] || 
        lower["quantity"] || 
        lower["count"] ||
        lower["tradelist count"] ||
        1
      );
      rest = {
        set: lower["set"] || lower["set_code"] || undefined,
        collector: lower["collector"] || lower["collector_number"] || undefined,
        foil: /^(1|true|foil|yes)$/i.test(String(lower["foil"]||"")) || undefined
      };
    } else {
      // loose formats: "2 Arcane Signet" OR "2, Arcane Signet" OR "Arcane Signet,2"
      const loose = raw.replace(/\s+/g, " ").trim();
      if (/^(#|\/\/)/.test(loose)) continue; // comments
      if (/^(LANDS|CREATURES|INSTANTS|SORCERIES|ARTIFACTS|ENCHANTMENTS|PLANESWALKERS|SIDEBOARD)\b/i.test(loose)) continue;
      let m = loose.match(/^(\d+)\s+(.+)$/) || loose.match(/^(.+?)\s*[x×]\s*(\d+)$/i) || loose.match(/^(.+?)\s*-\s*(\d+)$/);
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
    report: { totalLines: total, parsed, duplicatesCollapsed, errors, detectedFormat }
  };
}
