// components/NewDeckInline.tsx
"use client";

import * as React from "react";
import { trackValueMomentReached, startSession, endSession } from "@/lib/analytics-enhanced";
import { trackFirstAction } from "@/lib/analytics-enhanced";

export default function NewDeckInline() {
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  async function create() {
    const t = title.trim();
    if (!t) return;
    setBusy(true);

    startSession("deck_creation");

    try {
      const res = await fetch("/api/decks/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, is_public: false }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok || !json?.id) throw new Error(json?.error || `HTTP ${res.status}`);

      trackValueMomentReached("first_deck_created");
      trackFirstAction("deck_create", { deck_title: t });
      endSession("deck_creation", {
        success: true,
        deck_id: json.id,
        deck_title: t,
      });

      window.location.href = `/my-decks/${encodeURIComponent(json.id)}`;
    } catch (e: any) {
      endSession("deck_creation", {
        success: false,
        error: e?.message || "unknown_error",
      });

      alert(e?.message || "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={busy}
        className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all text-sm"
      >
        {busy ? "Creating..." : "Create Deck"}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-950 p-5 shadow-2xl shadow-black/60">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">Create Deck</h2>
              <p className="mt-1 text-sm text-neutral-400">Name it first, then you can start building.</p>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && title.trim() && create()}
              placeholder="Deck name..."
              className="w-full rounded-lg border-2 border-neutral-700 bg-black/50 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-blue-500"
              aria-label="New deck name"
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (busy) return;
                  setOpen(false);
                }}
                disabled={busy}
                className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={create}
                disabled={busy || !title.trim()}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:from-blue-500 hover:to-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
