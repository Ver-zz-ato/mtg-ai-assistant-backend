"use client";

import { useEffect, useState } from "react";

type Deck = {
  id: string;
  title: string | null;
  created_at?: string | null;
};

export default function RecentPublicDecks() {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    async function run() {
      try {
        setError(null);
        const res = await fetch("/api/decks/recent", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        // Expecting { ok: boolean, decks: Deck[] }
        const items: Deck[] = (json && (json.decks || json.items || [])) as Deck[];
        if (!abort) setDecks(items);
      } catch (e:any) {
        if (!abort) setError(e?.message ?? "Failed to load");
      }
    }
    run();
    return () => { abort = true };
  }, []);

  return (
    <div className="rounded-xl bg-gray-900/70 border border-gray-800 p-3">
      <h3 className="font-semibold text-gray-200 mb-2">Recent Decks</h3>

      {error ? (
        <div className="text-red-400 text-xs">Failed to load: {error}</div>
      ) : decks === null ? (
        <div className="text-xs text-gray-400">Loading…</div>
      ) : decks.length === 0 ? (
        <div className="text-xs text-gray-400">No public decks yet.</div>
      ) : (
        <ul className="space-y-1 max-h-64 overflow-auto pr-1">
          {decks.map((d) => (
            <li key={d.id}>
              <a
                href={`/d/${d.id}`}
                className="block rounded-md px-2 py-1 hover:bg-gray-800 transition-colors text-sm text-gray-100"
              >
                <div className="truncate">{d.title || "Untitled deck"}</div>
                {d.created_at ? (
                  <div className="text-[10px] text-gray-400">
                    {new Date(d.created_at).toLocaleString()}
                  </div>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
