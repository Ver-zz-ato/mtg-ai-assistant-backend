"use client";

import React from "react";

export default function SaveDeckButton({ getDeckText }: { getDeckText: () => string }) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [commander, setCommander] = React.useState("");
  const [isPublic, setIsPublic] = React.useState(false);

  async function onSave() {
    setSaving(true);
    setErrorMsg("");
    try {
      const deck_text = getDeckText();
      const r = await fetch("/api/decks/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, commander, deck_text, is_public: isPublic }),
      });

      if (r.status === 401) {
        setErrorMsg("Please sign in to save decks.");
        setSaving(false);
        return;
      }
      const j = await r.json();
      console.log("[SaveDeckButton] result", j);
      if (!j.ok) throw new Error(j.error || "Save failed");
      setOpen(false);
      // small toast substitute:
      alert(`Saved! Deck ID: ${j.id}`);
    } catch (e: any) {
      console.error("[SaveDeckButton] error", e);
      setErrorMsg(e.message || "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border px-3 py-2 rounded"
        disabled={saving}
      >
        Save deck
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-neutral-900 border rounded p-4 w-full max-w-md space-y-3">
            <div className="text-lg font-semibold">Save deck</div>

            <label className="text-sm">Title</label>
            <input
              className="w-full border rounded p-2 bg-neutral-950"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled Deck"
            />

            <label className="text-sm">Commander (optional)</label>
            <input
              className="w-full border rounded p-2 bg-neutral-950"
              value={commander}
              onChange={(e) => setCommander(e.target.value)}
              placeholder="e.g., Kaust, Cunning Instigator"
            />

            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              <span>Make public (shareable)</span>
            </label>

            {errorMsg && <div className="text-red-500 text-sm">{errorMsg}</div>}

            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded border" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </button>
              <button
                className="px-3 py-2 rounded bg-orange-600 text-white disabled:opacity-60"
                onClick={onSave}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
