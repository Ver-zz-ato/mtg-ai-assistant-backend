/**
 * Normalizes cost rows from upstream / local /api/collections/cost for /api/collections/cost-to-finish.
 *
 * Core fields (`card`, `need`, `unit`, `subtotal`, `source`) stay the stable contract.
 * Any additional keys on upstream rows (e.g. `kind`, `inDeckQty`, `zone`) are preserved so newer clients
 * can show richer copy without a second round-trip.
 */

type RawCostRow = Record<string, unknown>;

const KEYS_USED_FOR_CORE = new Set([
  "card",
  "name",
  "card_name",
  "cardName",
  "title",
  "need",
  "qty",
  "quantity",
  "needed",
  "count",
  "unit",
  "price",
  "unit_price",
  "unitCost",
  "subtotal",
  "total",
  "sum",
  "line_total",
  "lineTotal",
  "extended",
  "source",
  "src",
  "price_source",
]);

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeCostProxyRows(anyRows: unknown): Array<Record<string, unknown>> {
  const rows: RawCostRow[] = Array.isArray(anyRows) ? (anyRows as RawCostRow[]) : [];
  return rows
    .map((r) => {
      const card = String(r.card ?? r.name ?? r.card_name ?? r.cardName ?? r.title ?? "");
      const need = toNum(r.need ?? r.qty ?? r.quantity ?? r.needed ?? r.count, 0);
      const unit = toNum(r.unit ?? r.price ?? r.unit_price ?? r.unitCost, 0);
      const subtotal = toNum(
        r.subtotal ?? r.total ?? r.sum ?? r.line_total ?? r.lineTotal ?? r.extended,
        need * unit,
      );
      const source = (r.source ?? r.src ?? r.price_source ?? "Scryfall") as string;
      const core = { card, need, unit, subtotal, source };
      const preserved: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (!KEYS_USED_FOR_CORE.has(k)) preserved[k] = v;
      }
      return { ...core, ...preserved };
    })
    .filter((r) => String(r.card ?? "").length > 0);
}
