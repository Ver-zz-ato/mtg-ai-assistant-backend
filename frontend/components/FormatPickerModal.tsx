"use client";
import React from "react";
import { createPortal } from "react-dom";

/**
 * Formats for /new-deck — first-class formats only.
 * Legacy / Vintage / Brawl / Historic are intentionally omitted here until they
 * have truthful first-class deck-analysis and publish-validation support.
 */
export type PickedDeckFormat = "commander" | "standard" | "modern" | "pioneer" | "pauper";

export function formatToApiString(f: PickedDeckFormat): string {
  const map: Record<PickedDeckFormat, string> = {
    commander: "Commander",
    standard: "Standard",
    modern: "Modern",
    pioneer: "Pioneer",
    pauper: "Pauper",
  };
  return map[f];
}

interface FormatPickerModalProps {
  isOpen: boolean;
  onSelect: (format: PickedDeckFormat, options: { makePublic: boolean }) => void;
  onClose?: () => void;
  /** Disable format tiles while submit/navigation is in progress (guards double-click). */
  busy?: boolean;
}

const COMMANDER: {
  value: PickedDeckFormat;
  label: string;
  description: string;
  icon: string;
} = {
  value: "commander",
  label: "Commander",
  description: "100-card singleton, commander-led",
  icon: "⚔️",
};

const OTHER_FORMATS: Array<{
  value: PickedDeckFormat;
  label: string;
  description: string;
  icon: string;
}> = [
  { value: "standard", label: "Standard", description: "Rotating 60-card constructed", icon: "⭐" },
  { value: "modern", label: "Modern", description: "Non-rotating, powerful staples", icon: "🔮" },
  { value: "pioneer", label: "Pioneer", description: "Explorer-friendly constructed", icon: "🗺️" },
  { value: "pauper", label: "Pauper", description: "Commons-only, sharp and fair", icon: "🪙" },
];

export default function FormatPickerModal({ isOpen, onSelect, onClose, busy = false }: FormatPickerModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const [makePublic, setMakePublic] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (isOpen) setMakePublic(false);
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const select = (value: PickedDeckFormat) => {
    if (busy) return;
    onSelect(value, { makePublic });
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md">
      <div className="bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-700/80 sm:rounded-2xl rounded-t-2xl shadow-2xl w-full max-w-lg sm:max-w-2xl max-h-[min(100dvh,900px)] overflow-y-auto relative animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 sm:p-6">
          {/* Top bar: back + step */}
          <div className="flex items-center gap-3 mb-4">
            {onClose ? (
              <button
                type="button"
                onClick={() => !busy && onClose()}
                disabled={busy}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900/80 text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors disabled:opacity-50"
                aria-label="Go back"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            ) : (
              <span className="w-10" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Step 1 of 2</p>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Choose your format</h2>
            </div>
          </div>

          <p className="text-sm text-neutral-400 mb-5 sm:mb-6 leading-snug">
            Pick a format for your new deck. You can change this later in the deck builder.
          </p>
          <p className="text-xs text-neutral-500 mb-5 leading-relaxed">
            Commander, Modern, Pioneer, Standard, and Pauper currently have full AI analysis and validation support.
          </p>

          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-500 mb-3">Format</p>

          {/* Commander hero */}
          <button
            type="button"
            disabled={busy}
            onClick={() => select("commander")}
            className="group relative w-full text-left rounded-2xl overflow-hidden mb-4 transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            <div
              className="absolute inset-0 bg-gradient-to-br from-violet-600/90 via-cyan-600/85 to-blue-700/90 opacity-95 group-hover:opacity-100 transition-opacity"
              aria-hidden
            />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.12),_transparent_55%)]" />
            <div className="absolute -inset-px rounded-2xl border border-white/10 shadow-[0_0_40px_-8px_rgba(34,211,238,0.45)] group-hover:shadow-[0_0_48px_-4px_rgba(34,211,238,0.55)] transition-shadow" />
            <div className="relative flex items-start gap-4 p-5 sm:p-6">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-black/25 text-3xl shadow-inner ring-1 ring-white/10">
                {COMMANDER.icon}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="text-lg sm:text-xl font-bold text-white">{COMMANDER.label}</h3>
                  <span className="inline-flex items-center rounded-full bg-black/30 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-100 ring-1 ring-cyan-400/40">
                    Recommended
                  </span>
                </div>
                <p className="text-sm text-white/85 leading-relaxed">{COMMANDER.description}</p>
              </div>
            </div>
          </button>

          {/* Other formats */}
          <div className="grid grid-cols-2 gap-3 sm:gap-3.5">
            {OTHER_FORMATS.map((format) => (
              <button
                key={format.value}
                type="button"
                disabled={busy}
                onClick={() => select(format.value)}
                className="group relative flex flex-col rounded-xl border border-neutral-700/90 bg-neutral-900/40 bg-gradient-to-br from-neutral-800/50 to-neutral-900/80 p-4 text-left transition-all duration-200 hover:border-cyan-500/50 hover:from-neutral-800/70 hover:to-neutral-900/90 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-950/80 text-2xl shadow-inner ring-1 ring-white/5 mb-3 group-hover:ring-cyan-500/30">
                  {format.icon}
                </div>
                <h3 className="text-base font-semibold text-white mb-1 group-hover:text-cyan-100 transition-colors">
                  {format.label}
                </h3>
                <p className="text-xs text-neutral-400 leading-snug line-clamp-3">{format.description}</p>
              </button>
            ))}
          </div>

          {/* Visibility (default private) */}
          <div className="mt-6 pt-5 border-t border-neutral-800">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-neutral-600 bg-neutral-900 text-cyan-600 focus:ring-cyan-500"
                checked={makePublic}
                disabled={busy}
                onChange={(e) => setMakePublic(e.target.checked)}
              />
              <span className="flex-1 text-sm">
                <span className="font-medium text-neutral-200">Make deck public</span>
                {!makePublic && (
                  <span className="block text-xs text-neutral-500 mt-1">Only you can see this deck.</span>
                )}
                {makePublic && (
                  <span className="block text-xs text-amber-200/90 mt-1">
                    Public decks can be viewed by others and may appear on your public profile.
                  </span>
                )}
              </span>
            </label>
          </div>

          {onClose && (
            <div className="flex justify-center mt-5">
              <button
                type="button"
                onClick={() => !busy && onClose()}
                disabled={busy}
                className="px-4 py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
