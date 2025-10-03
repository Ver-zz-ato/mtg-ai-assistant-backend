"use client";
import React from "react";

export default function ConfirmDeleteModal({
  open,
  title = "Delete deck",
  message = "Type DELETE to confirm deck deletion. This cannot be undone.",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title?: string;
  message?: string;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(()=>{ if(open){ setText(""); setBusy(false); } }, [open]);
  if (!open) return null;
  const disabled = text !== "DELETE" || busy;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="text-lg font-semibold mb-2">{title}</div>
        <div className="text-sm opacity-80 mb-3">{message}</div>
        <input
          autoFocus
          value={text}
          onChange={(e)=>setText(e.target.value)}
          placeholder="Type DELETE"
          className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm"
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="px-3 py-1.5 rounded border border-neutral-700 hover:bg-neutral-800 text-sm">Cancel</button>
          <button
            onClick={async()=>{ try{ setBusy(true); await onConfirm(); } finally { setBusy(false); } }}
            disabled={disabled}
            className={`px-3 py-1.5 rounded text-sm ${disabled? 'bg-red-900/30 text-red-300 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-500'}`}
          >
            {busy? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}