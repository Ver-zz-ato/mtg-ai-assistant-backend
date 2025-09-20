"use client";
import { useEffect, useState } from "react";
import { listThreads } from "@/lib/threads";
import type { ThreadSummary } from "@/types/chat";

type Props = { value: string | null; onChange: (id: string | null) => void };

export default function HistoryDropdown({ value, onChange }: Props) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  useEffect(() => { (async () => {
    const { threads } = await listThreads();
    setThreads(threads);
  })(); }, []);

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full bg-neutral-900 text-white border border-neutral-700 rounded px-2 py-1"
    >
      <option value="">New thread</option>
      {threads.map((t) => (
        <option key={t.id} value={t.id}>
          {t.title || "(untitled)"} — {new Date(t.created_at).toLocaleString()}
        </option>
      ))}
    </select>
  );
}
