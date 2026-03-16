"use client";

import React from "react";
import { capture } from "@/lib/ph";

const CORRECTION_REASONS = [
  { id: "wrong_rules", label: "Wrong rules / legality" },
  { id: "misunderstood_deck", label: "Misunderstood my deck" },
  { id: "bad_recommendation", label: "Bad card recommendation" },
  { id: "too_generic", label: "Too generic" },
  { id: "missed_synergy", label: "Missed key synergy" },
  { id: "wrong_commander_archetype", label: "Wrong commander / archetype read" },
  { id: "incorrect_data", label: "Incorrect data" },
  { id: "other", label: "Other" },
] as const;

export type ChatCorrectionModalProps = {
  open: boolean;
  onClose: () => void;
  messageId: string;
  aiContent: string;
  userMessageContent: string | null;
  threadId: string | null;
  deckId?: string | null;
  commanderName?: string | null;
  format?: string | null;
  promptVersion?: string | null;
  chatSurface: "main_chat" | "deck_chat";
  onSuccess: () => void;
};

export default function ChatCorrectionModal({
  open,
  onClose,
  messageId,
  aiContent,
  userMessageContent,
  threadId,
  deckId,
  commanderName,
  format,
  promptVersion,
  chatSurface,
  onSuccess,
}: ChatCorrectionModalProps) {
  const [reasons, setReasons] = React.useState<string[]>([]);
  const [correctionText, setCorrectionText] = React.useState("");
  const [otherText, setOtherText] = React.useState("");
  const [betterCards, setBetterCards] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const canSubmit =
    reasons.length > 0 ||
    correctionText.trim().length > 0 ||
    otherText.trim().length > 0 ||
    betterCards.trim().length > 0;

  const toggleReason = (id: string) => {
    setReasons((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const handleOpen = React.useCallback(() => {
    if (!open) return;
    try {
      capture("chat_correction_opened", {
        feature: "chat",
        thread_id: threadId ?? undefined,
        message_id: messageId,
        deck_id: deckId ?? undefined,
        has_deck_context: !!(deckId && deckId.trim()),
      });
    } catch {
      // analytics must not affect flow
    }
  }, [open, threadId, messageId, deckId]);

  React.useEffect(() => {
    if (open) handleOpen();
  }, [open, handleOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const pagePath =
        typeof window !== "undefined" ? window.location.pathname : "";
      const res = await fetch("/api/chat/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "chat_correction",
          threadId: threadId ?? null,
          messageId,
          issueTypes: reasons.length > 0 ? reasons : ["other"],
          description: otherText.trim() || null,
          correction_text: correctionText.trim() || null,
          better_cards_text: betterCards.trim() || null,
          aiResponseText: aiContent,
          userMessageText: userMessageContent,
          deck_id: deckId ?? null,
          commander_name: commanderName ?? null,
          format: format ?? null,
          prompt_version_id: promptVersion ?? null,
          page_path: pagePath || null,
          chat_surface: chatSurface,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to submit");
      setSubmitted(true);
      try {
        capture("chat_correction_submitted", {
          feature: "chat",
          thread_id: threadId ?? undefined,
          message_id: messageId,
          issue_types: reasons.length > 0 ? reasons : ["other"],
          deck_id: deckId ?? undefined,
          commander_name: commanderName ?? undefined,
          prompt_version: promptVersion ?? undefined,
          has_better_cards: betterCards.trim().length > 0,
          chat_surface: chatSurface,
        });
      } catch {
        // analytics must not affect flow
      }
      try {
        const tc = await import("@/lib/toast-client");
        tc.toast("Thanks — this helps improve the AI.", "success");
      } catch {}
      onSuccess();
      onClose();
    } catch (err: any) {
      try {
        const tc = await import("@/lib/toast-client");
        tc.toastError(err?.message || "Failed to submit correction");
      } catch {}
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="correction-modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="correction-modal-title" className="text-base font-semibold text-neutral-200 mb-3">
          Correct the AI
        </h2>
        <p className="text-sm text-neutral-400 mb-3">What was wrong?</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {CORRECTION_REASONS.map((opt) => (
              <label
                key={opt.id}
                className="flex items-center gap-2 cursor-pointer hover:bg-neutral-800 px-2 py-1 rounded text-sm"
              >
                <input
                  type="checkbox"
                  checked={reasons.includes(opt.id)}
                  onChange={() => toggleReason(opt.id)}
                  className="accent-amber-500 rounded"
                />
                <span className="text-neutral-300">{opt.label}</span>
              </label>
            ))}
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">
              What should it have said instead? (optional)
            </label>
            <textarea
              value={correctionText}
              onChange={(e) => setCorrectionText(e.target.value.slice(0, 2000))}
              placeholder="e.g. It should have suggested..."
              rows={2}
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm resize-none"
              maxLength={2000}
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">
              Better cards (optional)
            </label>
            <input
              type="text"
              value={betterCards}
              onChange={(e) => setBetterCards(e.target.value.slice(0, 500))}
              placeholder="e.g. Heroic Intervention, Reanimate"
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm"
              maxLength={500}
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">
              Anything else? (optional)
            </label>
            <textarea
              value={otherText}
              onChange={(e) => setOtherText(e.target.value.slice(0, 500))}
              placeholder="Additional notes..."
              rows={1}
              className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm resize-none"
              maxLength={500}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-3 py-1.5 rounded border border-neutral-600 text-sm hover:bg-neutral-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || busy}
              className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm disabled:opacity-50 hover:bg-amber-500"
            >
              {busy ? "Submitting…" : submitted ? "Submitted" : "Submit correction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
