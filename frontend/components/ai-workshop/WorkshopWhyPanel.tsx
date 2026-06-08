"use client";

import type { CardChangeReasons } from "@/lib/deck/ai-workshop-helpers";

type Props = {
  whyText: string;
  changeReasons: CardChangeReasons | null;
  onClose?: () => void;
};

export function WorkshopWhyPanel({ whyText, changeReasons, onClose }: Props) {
  const added = changeReasons?.added ? Object.entries(changeReasons.added) : [];
  const removed = changeReasons?.removed ? Object.entries(changeReasons.removed) : [];

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-violet-100">Why these changes</h3>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-neutral-400 hover:text-white"
          >
            Close
          </button>
        ) : null}
      </div>
      {whyText ? <p className="mt-2 text-sm leading-6 text-neutral-300">{whyText}</p> : null}
      {added.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase text-emerald-300/90">Adds</p>
          <ul className="mt-1 space-y-1 text-sm text-neutral-300">
            {added.map(([name, reason]) => (
              <li key={`add-${name}`}>
                <span className="font-medium text-emerald-200">{name}</span>
                <span className="text-neutral-400"> — {reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {removed.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase text-rose-300/90">Cuts</p>
          <ul className="mt-1 space-y-1 text-sm text-neutral-300">
            {removed.map(([name, reason]) => (
              <li key={`cut-${name}`}>
                <span className="font-medium text-rose-200">{name}</span>
                <span className="text-neutral-400"> — {reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
