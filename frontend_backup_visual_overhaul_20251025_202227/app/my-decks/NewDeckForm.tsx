// app/my-decks/NewDeckForm.tsx
"use client";
import * as React from "react";

export default function NewDeckForm() {
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/decks/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json?.id) throw new Error(json?.error || `HTTP ${res.status}`);
      window.location.href = `/my-decks/${encodeURIComponent(json.id)}`;
    } catch (e:any) {
      alert(e?.message || "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New deck name"
        className="rounded border border-neutral-700 bg-black/40 px-3 py-1 outline-none text-sm"
        aria-label="New deck name"
      />
      <button onClick={create} disabled={busy} className="text-sm underline underline-offset-4">
        {busy ? "Creating…" : "Create"}
      </button>
    </div>
  );
}
