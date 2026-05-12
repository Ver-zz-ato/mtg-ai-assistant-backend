"use client";
import React from "react";
import Link from "next/link";

function fmt(d: string | null) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function ratingLabel(r: number | null) {
  if (r == null) return "—";
  if (r === -1) return "👎";
  if (r === 1) return "👍";
  if (r >= 1 && r <= 5) return "⭐".repeat(r);
  return String(r);
}

export default function AdminFeedbackPage() {
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | "low" | "high">("all");

  async function load(p = 1) {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", "50");
      if (filter === "low") params.set("maxRating", "2");
      if (filter === "high") params.set("minRating", "4");
      const r = await fetch(`/api/admin/feedback?${params}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.error || "load failed");
      setRows(j.feedback || []);
      setTotal(j.total ?? 0);
      setPage(j.page ?? 1);
      setHasMore(j.hasMore ?? false);
    } catch (e: any) {
      setErr(e?.message || "load failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load(1);
  }, [filter]);

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href="/admin/JustForDavy" className="text-sm text-neutral-400 hover:text-white mb-2 inline-block">
            ← Admin
          </Link>
          <h1 className="text-xl font-semibold">User Feedback</h1>
        </div>
        <div className="flex gap-2">
          {(["all", "low", "high"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-sm font-medium ${
                filter === f
                  ? "bg-neutral-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {f === "all" ? "All" : f === "low" ? "Low (≤2)" : "High (≥4)"}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="text-sm text-red-400">{err}</div>}

      <section className="rounded border border-neutral-800 overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-neutral-900 z-10">
              <tr>
                <th className="text-left py-2 px-3 font-medium">Date</th>
                <th className="text-left py-2 px-3 font-medium">Rating</th>
                <th className="text-left py-2 px-3 font-medium">User</th>
                <th className="text-left py-2 px-3 font-medium">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-neutral-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-neutral-500">
                    No feedback yet
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-neutral-800 hover:bg-neutral-900/50"
                  >
                    <td className="py-2 px-3 text-xs text-neutral-500 whitespace-nowrap">
                      {fmt(row.created_at)}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={
                          row.rating != null && row.rating <= 2
                            ? "text-amber-400"
                            : row.rating != null && row.rating >= 4
                              ? "text-emerald-400"
                              : ""
                        }
                      >
                        {ratingLabel(row.rating)}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-neutral-300">
                      {row.email || row.user_id || "—"}
                    </td>
                    <td className="py-2 px-3 text-neutral-300 max-w-md">
                      <span className="whitespace-pre-wrap break-words">
                        {row.text || "—"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-t border-neutral-800 bg-neutral-900/50 text-xs text-neutral-500">
          <span>
            {total} total {filter !== "all" && `(filtered)`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => load(page - 1)}
              disabled={loading || page <= 1}
              className="px-2 py-1 rounded hover:bg-neutral-700 disabled:opacity-50"
            >
              ← Prev
            </button>
            <span className="py-1">Page {page}</span>
            <button
              onClick={() => load(page + 1)}
              disabled={loading || !hasMore}
              className="px-2 py-1 rounded hover:bg-neutral-700 disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
