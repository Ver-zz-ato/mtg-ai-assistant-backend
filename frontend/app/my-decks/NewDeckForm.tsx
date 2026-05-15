// app/my-decks/NewDeckForm.tsx
"use client";
import * as React from "react";

export default function NewDeckForm() {
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function create() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await fetch("/api/decks/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          is_public: false,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json?.id) throw new Error(json?.error || `HTTP ${res.status}`);
      window.location.href = `/my-decks/${encodeURIComponent(json.id)}`;
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New deck name"
        className="rounded border border-neutral-700 bg-black/40 px-3 py-1 outline-none text-sm"
        aria-label="New deck name"
      />
      <span className="text-xs text-neutral-500">New decks start private.</span>
      <button onClick={create} disabled={busy} className="text-sm underline underline-offset-4">
        {busy ? "Creating..." : "Create"}
      </button>
    </div>
  );
}
