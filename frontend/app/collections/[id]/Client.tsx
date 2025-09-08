"use client";

import * as React from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type ItemRow = {
  card_name: string;
  qty: number;
  created_at: string | null;
};

export default function Client({ collectionId }: { collectionId: string }) {
  const supabase = React.useMemo(() => createBrowserSupabaseClient(), []);
  const [rows, setRows] = React.useState<ItemRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // NOTE: no `id` here — your table doesn't have it (by design).
        const { data, error } = await supabase
          .from("collection_items")
          .select("card_name,qty,created_at")
          .eq("collection_id", collectionId)
          .order("card_name", { ascending: true });

        if (error) throw error;

        if (alive) {
          setRows(
            (data ?? []).map((r) => ({
              card_name: String(r.card_name ?? ""),
              qty: Number(r.qty ?? 0),
              created_at: r.created_at ?? null,
            }))
          );
        }
      } catch (e: any) {
        if (alive) setError(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase, collectionId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Collection</h1>
        <Link href="/collections" className="text-sm underline underline-offset-4">
          ← Back to Collections
        </Link>
      </div>

      <div className="text-xs text-gray-400 break-all">ID: {collectionId}</div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-lg border p-4 text-sm opacity-70">Loading…</div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-lg border p-4 text-sm">
          No cards in this collection yet.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b bg-black/20">
              <tr>
                <th className="text-left py-2 px-3">Card</th>
                <th className="text-right py-2 px-3">Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.card_name}-${i}`} className="border-b">
                  <td className="py-1.5 px-3">{r.card_name}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{r.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
