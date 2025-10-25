// components/FeedbackFab.tsx
"use client";
import React from "react";

export default function FeedbackFab() {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [rating, setRating] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, rating }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      setMsg("Thanks! Feedback sent.");
      setText("");
      setRating(null);
      setOpen(false);
    } catch (e: any) {
      setMsg(e?.message || "Error");
    }
    setBusy(false);
    setTimeout(() => setMsg(null), 1500);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-40 rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:bg-neutral-800"
        aria-label="Feedback"
      >
        Feedback
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-xl">
            <div className="mb-2 text-sm font-semibold">Send Feedback</div>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs text-neutral-400">Rating:</span>
              {[1,2,3,4,5].map(n => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className={`h-7 w-7 rounded-md border text-sm ${rating===n ? "bg-neutral-700" : "bg-neutral-800"} border-neutral-700`}
                >
                  {n}
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What’s working? What’s confusing?"
              className="h-28 w-full rounded-md border border-neutral-700 bg-neutral-950 p-2 text-sm outline-none focus:ring-1 focus:ring-neutral-600"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-md px-3 py-1 text-sm hover:bg-neutral-800">Cancel</button>
              <button
                disabled={busy || !text.trim()}
                onClick={submit}
                className="rounded-md bg-neutral-100 px-3 py-1 text-sm text-black disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
      {msg && <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-black/80 px-3 py-2 text-xs">{msg}</div>}
    </>
  );
}
