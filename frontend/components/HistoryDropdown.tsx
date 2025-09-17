// components/HistoryDropdown.tsx
"use client";
import { useEffect, useState } from "react";

type Thread = { id: string; title: string | null; created_at: string | null };

export default function HistoryDropdown(props: {
  threadId?: string | null;
  onSelect: (id: string) => void;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadThreads() {
    try {
      const res = await fetch("/api/chat/threads/list", { cache: "no-store" });
      const json = await res.json();
      if (json?.ok) setThreads(json.threads ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadThreads(); }, []);

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-400">History:</label>
      <select
        value={props.threadId ?? ""}
        onChange={(e) => props.onSelect(e.target.value)}
        className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 min-w-[220px] text-sm"
        disabled={loading}
      >
        <option value="">{loading ? "Loading…" : "New chat…"}</option>
        {threads.map((t) => (
          <option key={t.id} value={t.id}>
            {(t.title ?? "Untitled") + (t.created_at ? ` — ${new Date(t.created_at).toLocaleString()}` : "")}
          </option>
        ))}
      </select>
    </div>
  );
}
