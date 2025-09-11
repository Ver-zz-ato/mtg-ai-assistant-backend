// components/DebugDeckInspector.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type ApiDeck = {
  ok?: boolean;
  deck?: any;
  cards?: any[];
  error?: string;
  warning?: string;
};

export default function DebugDeckInspector({ deckId }: { deckId?: string }) {
  const [open, setOpen] = useState(false);
  const [apiData, setApiData] = useState<ApiDeck | null>(null);
  const [apiStatus, setApiStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const validId = useMemo(() => (deckId && deckId !== "undefined" ? deckId : null), [deckId]);

  useEffect(() => {
    if (!open || !validId) return;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/decks/${validId}`, { cache: "no-store" });
        setApiStatus(res.status);
        const json = await res.json().catch(() => null);
        setApiData(json);
      } catch (e: any) {
        setErr(e?.message || "fetch failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, validId]);

  return (
    <div className="mt-4 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 border rounded"
        aria-expanded={open ? "true" : "false"}
        title="Toggle deck debug info"
      >
        {open ? "Hide debug" : "Show debug"}
      </button>
      {open && (
        <div className="mt-2 rounded border p-3 bg-black/20">
          <div className="mb-2 opacity-80">
            <div>deckId: <code>{String(deckId)}</code></div>
            <div>API: <code>/api/decks/{String(validId || "undefined")}</code></div>
            <div>Status: <code>{apiStatus ?? "-"}</code></div>
            {loading && <div>Loading…</div>}
            {err && <div className="text-red-400">Fetch error: {err}</div>}
          </div>
          <pre className="whitespace-pre-wrap break-words text-[11px] leading-tight">
{`API response:`}
{apiData ? JSON.stringify(apiData, null, 2) : "(no data yet)"}
          </pre>
        </div>
      )}
    </div>
  );
}
