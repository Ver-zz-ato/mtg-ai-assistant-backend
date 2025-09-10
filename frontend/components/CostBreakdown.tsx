"use client";
import React from "react";

type Row = {
  name?: string;
  card?: string;
  qty?: number;
  count?: number;
  unit_price?: number;
  price?: number;
  subtotal?: number;
  total?: number;
};

function currencyFmt(v: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

export default function CostBreakdown({
  rows,
  currency,
}: {
  rows: Row[];
  currency: string;
}) {
  if (!rows || rows.length === 0) {
    return <div className="text-gray-400 text-sm">No rows yet.</div>;
  }

  const safeRows = rows.map((r, i) => {
    const qty = (typeof r.qty === "number" ? r.qty : (typeof r.count === "number" ? r.count : 1)) || 1;
    const name = r.name ?? r.card ?? `Card ${i + 1}`;
    const unit = (typeof r.unit_price === "number" ? r.unit_price : (typeof r.price === "number" ? r.price : 0)) || 0;
    const sub = (typeof r.subtotal === "number" ? r.subtotal : (qty * unit)) || 0;
    return { name, qty, unit, sub };
  });

  const total = safeRows.reduce((acc, r) => acc + (r.sub || 0), 0);

  return (
    <div className="mt-6">
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-900/40 text-gray-300">
            <tr>
              <th className="text-left px-3 py-2">Card</th>
              <th className="text-right px-3 py-2">Qty</th>
              <th className="text-right px-3 py-2">Unit</th>
              <th className="text-right px-3 py-2">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {safeRows.map((r, idx) => (
              <tr key={idx} className="border-t border-gray-800">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right">× {r.qty}</td>
                <td className="px-3 py-2 text-right">{currencyFmt(r.unit, currency)}</td>
                <td className="px-3 py-2 text-right font-medium">{currencyFmt(r.sub, currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-800 bg-gray-900/50">
              <td className="px-3 py-2" colSpan={3}>Total</td>
              <td className="px-3 py-2 text-right font-semibold">{currencyFmt(total, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
