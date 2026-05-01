// app/my-decks/NewDeckForm.tsx
"use client";
import * as React from "react";
import { validatePublicText } from "@/lib/profanity";

export default function NewDeckForm() {
  const [title, setTitle] = React.useState("");
  const [makePublic, setMakePublic] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function create() {
    const trimmed = title.trim();
    if (!trimmed) return;
    if (makePublic) {
      const v = validatePublicText(trimmed, "Deck name");
      if (!v.ok) {
        alert(v.message);
        return;
      }
    }
    setBusy(true);
    try {
      const res = await fetch("/api/decks/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          is_public: makePublic === true,
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
      <label className="flex items-center gap-2 text-xs text-neutral-400">
        <input
          type="checkbox"
          checked={makePublic}
          onChange={(e) => setMakePublic(e.target.checked)}
        />
        Public
      </label>
      <button onClick={create} disabled={busy} className="text-sm underline underline-offset-4">
        {busy ? "Creating…" : "Create"}
      </button>
    </div>
  );
}
