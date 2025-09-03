"use client";

import React from "react";
import Link from "next/link";

type DeckRow = {
  id: string;
  title: string | null;
  commander: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export default function MyDecksPage() {
  const [rows, setRows] = React.useState<DeckRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMsg("");
      try {
        const r = await fetch("/api/decks/my", { cache: "no-store" });
        if (r.status === 401) {
          setErrorMsg("Please sign in to view your decks.");
          setRows([]);
        } else {
          const j = await r.json();
          if (!j.ok) throw new Error(j.error || "Failed to load decks");
          if (!cancelled) setRows(j.decks || []);
        }
      } catch (e: any) {
        setErrorMsg(e.message || "Unexpected error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">My Decks</h1>

      {loading && <div>Loading…</div>}
      {errorMsg && <div className="text-red-500">{errorMsg}</div>}
      {!loading && !errorMsg && rows.length === 0 && <div>No decks yet.</div>}

      <div className="space-y-3">
        {rows.map((d) => (
          <div key={d.id} className="border rounded p-3 flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-medium">{d.title || "Untitled Deck"}</div>
              <div className="text-xs text-neutral-400">
                {d.commander ? `Commander: ${d.commander} • ` : ""}
                Updated {new Date(d.updated_at).toLocaleString()} • {d.is_public ? "Public" : "Private"}
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                className="border px-3 py-1 rounded"
                href={`/collections/cost-to-finish?deckId=${encodeURIComponent(d.id)}`}
              >
                Cost to finish
              </Link>
              <Link className="border px-3 py-1 rounded" href={`/api/decks/${encodeURIComponent(d.id)}`}>
                JSON
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
