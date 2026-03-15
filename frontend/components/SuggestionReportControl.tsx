"use client";

import React from "react";

const REPORT_ISSUE_OPTIONS = [
  { id: "wrong_card", label: "Wrong card suggested" },
  { id: "too_generic", label: "Too generic" },
  { id: "misunderstood_deck", label: "Misunderstood my deck" },
  { id: "rules_issue", label: "Rules issue" },
  { id: "outside_color_identity", label: "Outside color identity" },
  { id: "bug_broken", label: "Bug / broken" },
  { id: "other", label: "Other" },
] as const;

const FEATURE = "deck_analyzer_suggestion";
const REPORT_API = "/api/chat/report";

export interface SuggestionReportControlProps {
  suggestion: { card: string; reason?: string; category?: string; id?: string };
  deckId: string;
  commanderName?: string | null;
  promptVersionId?: string | null;
  suggestionIndex: number;
  onReported?: () => void;
}

function deriveSuggestionId(
  s: { card: string; category?: string; id?: string },
  deckId: string,
  index: number
): string {
  if (s.id) return s.id;
  return `derived:${deckId}:${s.category ?? "optional"}:${s.card}:${index}`;
}

export default function SuggestionReportControl({
  suggestion,
  deckId,
  commanderName,
  promptVersionId,
  suggestionIndex,
  onReported,
}: SuggestionReportControlProps) {
  const [open, setOpen] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [description, setDescription] = React.useState("");

  const suggestionId = deriveSuggestionId(suggestion, deckId, suggestionIndex);

  const toggleReason = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpen = () => {
    if (submitted || busy) return;
    setOpen(true);
    try {
      import("@/lib/ph").then(({ capture }) => {
        capture("suggestion_report_opened", {
          feature: FEATURE,
          suggestion_id: suggestionId,
        });
      }).catch(() => {});
    } catch {}
  };

  const handleSubmit = async () => {
    const hasReasons = selected.size > 0;
    const hasDesc = description.trim().length > 0;
    if (!hasReasons && !hasDesc) return;
    setBusy(true);
    try {
      const issueTypes = hasReasons ? Array.from(selected) : ["other"];
      const res = await fetch(REPORT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: FEATURE,
          issueTypes,
          description: description.trim().slice(0, 2000) || null,
          deck_id: deckId,
          commander_name: commanderName ?? null,
          suggestion_id: suggestionId,
          suggested_card_name: suggestion.card,
          suggestion_category: suggestion.category ?? null,
          suggestion_index: suggestionIndex,
          prompt_version_id: promptVersionId ?? null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Failed to submit");
      }
      setSubmitted(true);
      setOpen(false);
      try {
        window.dispatchEvent(new CustomEvent("toast", { detail: "Thanks — this helps improve the AI." }));
      } catch {}
      onReported?.();
      try {
        const issueTypesArr = Array.from(selected);
        const primary = issueTypesArr.length > 0 ? issueTypesArr[0] : undefined;
        import("@/lib/ph").then(({ capture }) => {
          capture("suggestion_report_submitted", {
            feature: FEATURE,
            suggestion_id: suggestionId,
            suggestion_category: suggestion.category ?? null,
            suggested_card_name: suggestion.card,
            issue_types: issueTypesArr,
            primary_issue_type: primary ?? null,
            deck_id: deckId,
            commander_name: commanderName ?? null,
            prompt_version_id: promptVersionId ?? null,
          });
        }).catch(() => {});
      } catch {}
    } catch {
      // fail-open: don't block UI
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    setOpen(false);
    setSelected(new Set());
    setDescription("");
  };

  if (submitted) {
    return (
      <span className="text-[9px] text-neutral-500 whitespace-nowrap" aria-live="polite">
        Reported
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="min-h-[40px] inline-flex items-center px-2 py-1.5 rounded bg-neutral-800/60 hover:bg-neutral-700/60 text-neutral-400 text-[9px] whitespace-nowrap touch-manipulation"
        title="Report bad suggestion"
        aria-expanded={open}
      >
        Report
      </button>
      {open && (
        <div
          className="mt-2 p-3 rounded-lg border border-neutral-700 bg-neutral-900 text-left space-y-2 w-full basis-full"
          role="dialog"
          aria-label="Report bad suggestion"
        >
          <div className="font-medium text-[11px]">Report bad suggestion</div>
          <div className="flex flex-wrap gap-1.5">
            {REPORT_ISSUE_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                className="inline-flex items-center gap-1 cursor-pointer hover:bg-neutral-800 px-2 py-1 rounded text-[10px]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(opt.id)}
                  onChange={() => toggleReason(opt.id)}
                  className="accent-amber-500 rounded"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            placeholder="What went wrong? (optional)"
            rows={2}
            className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] resize-none"
            maxLength={500}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="px-2 py-1 rounded border border-neutral-600 text-[10px] hover:bg-neutral-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy || (selected.size === 0 && !description.trim())}
              className="px-2 py-1 rounded bg-amber-600 text-black text-[10px] font-medium hover:bg-amber-500 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Submit"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
