import { getFormatRules, isBasicLandName } from "@/lib/deck/formatRules";

export function normCardName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type DraftCardRow = { name: string; qty: number };

export class CollectionManualDeckDraft {
  private readonly byNorm = new Map<string, DraftCardRow>();

  constructor(initial?: DraftCardRow[]) {
    for (const row of initial ?? []) {
      this.setQty(row.name, row.qty);
    }
  }

  getQty(name: string): number {
    return this.byNorm.get(normCardName(name))?.qty ?? 0;
  }

  totalCards(): number {
    let n = 0;
    for (const row of this.byNorm.values()) n += row.qty;
    return n;
  }

  rows(): DraftCardRow[] {
    return [...this.byNorm.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  maxAddAllowed(
    name: string,
    format: string,
    collectionQty: number,
  ): number {
    const rules = getFormatRules(format);
    const current = this.getQty(name);
    const capFromCollection = Math.max(0, Math.floor(collectionQty));
    let capFromFormat = rules.maxCopies;
    if (rules.maxCopies === 1 && isBasicLandName(name)) {
      capFromFormat = capFromCollection;
    }
    return Math.max(0, Math.min(capFromCollection, capFromFormat) - current);
  }

  addOne(name: string, format: string, collectionQty: number): boolean {
    if (this.maxAddAllowed(name, format, collectionQty) <= 0) return false;
    const key = normCardName(name);
    const existing = this.byNorm.get(key);
    if (existing) {
      existing.qty += 1;
    } else {
      this.byNorm.set(key, { name: name.trim(), qty: 1 });
    }
    return true;
  }

  setQty(name: string, qty: number): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = normCardName(trimmed);
    const n = Math.max(0, Math.floor(qty));
    if (n === 0) this.byNorm.delete(key);
    else this.byNorm.set(key, { name: trimmed, qty: n });
  }

  clear(): void {
    this.byNorm.clear();
  }

  /** Build decklist text; commander line first when provided (Commander format). */
  toDeckText(commander?: string | null): string {
    const lines: string[] = [];
    const cmd = commander?.trim();
    const rows = this.rows();
    if (cmd) {
      const cmdKey = normCardName(cmd);
      const cmdRow = rows.find((r) => normCardName(r.name) === cmdKey);
      lines.push(`1 ${cmd}`);
      for (const row of rows) {
        if (normCardName(row.name) === cmdKey) continue;
        lines.push(`${row.qty} ${row.name}`);
      }
      if (!cmdRow) {
        /* commander only in header */
      }
    } else {
      for (const row of rows) {
        lines.push(`${row.qty} ${row.name}`);
      }
    }
    return lines.join("\n");
  }
}
