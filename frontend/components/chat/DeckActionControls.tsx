"use client";

import React from "react";
import { toast, toastError } from "@/lib/toast-client";

type PendingDeckAction = {
  id?: string;
  deckId?: string;
  status?: string;
  summary?: string;
};

function getPendingDeckAction(metadata: unknown): PendingDeckAction | null {
  const meta = metadata as { pendingDeckAction?: PendingDeckAction | null } | null | undefined;
  const action = meta?.pendingDeckAction;
  if (!action?.id || action.status !== "pending") return null;
  return action;
}

export default function DeckActionControls({
  metadata,
  onComplete,
}: {
  metadata: unknown;
  onComplete?: () => void;
}) {
  const action = getPendingDeckAction(metadata);
  const [busy, setBusy] = React.useState<"apply" | "cancel" | null>(null);
  if (!action) return null;

  async function run(kind: "apply" | "cancel") {
    if (!action?.id) return;
    setBusy(kind);
    try {
      const res = await fetch(`/api/chat/deck-actions/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId: action.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || `Failed to ${kind}`);
      toast(kind === "apply" ? "Deck change applied." : "Deck change cancelled.", "success");
      onComplete?.();
    } catch (e: any) {
      toastError(e?.message || `Failed to ${kind} deck change`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-2 text-xs">
      <div className="font-semibold text-emerald-100">Pending deck change</div>
      {action.summary ? <div className="mt-1 whitespace-pre-wrap text-emerald-100/80">{action.summary}</div> : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("apply")}
          className="rounded-md bg-emerald-500 px-3 py-1.5 font-semibold text-black disabled:opacity-50"
        >
          {busy === "apply" ? "Applying..." : "Apply"}
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("cancel")}
          className="rounded-md border border-neutral-600 px-3 py-1.5 text-neutral-100 disabled:opacity-50"
        >
          {busy === "cancel" ? "Cancelling..." : "Cancel"}
        </button>
      </div>
    </div>
  );
}
