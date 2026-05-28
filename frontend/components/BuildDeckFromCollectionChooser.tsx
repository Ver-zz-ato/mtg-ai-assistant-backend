"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

export type BuildFromCollectionMode = "manual" | "ai";

interface BuildDeckFromCollectionChooserProps {
  onClose: () => void;
  onSelect: (mode: BuildFromCollectionMode) => void;
}

export default function BuildDeckFromCollectionChooser({
  onClose,
  onSelect,
}: BuildDeckFromCollectionChooserProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] bg-black/80 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-white mb-2">Build a deck from this collection</h2>
        <p className="text-sm text-neutral-400 mb-6">Choose how you want to build.</p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => onSelect("manual")}
            className="w-full py-4 px-5 rounded-xl border border-neutral-600 bg-neutral-900 hover:bg-neutral-800 text-left transition-colors"
          >
            <span className="block font-bold text-white text-lg">Build it myself</span>
            <span className="block text-sm text-neutral-400 mt-1">
              Pick format, browse your collection, add cards one by one.
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSelect("ai")}
            className="w-full py-4 px-5 rounded-xl border border-purple-500/50 bg-gradient-to-r from-purple-950/80 to-indigo-950/80 hover:from-purple-900/60 hover:to-indigo-900/60 text-left transition-colors"
          >
            <span className="block font-bold text-white text-lg">
              Build it with AI <span aria-hidden>✨</span>
            </span>
            <span className="block text-sm text-neutral-300 mt-1">
              Guided builder, playstyle quiz, or let AI choose for you.
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full py-2 text-sm text-neutral-500 hover:text-neutral-300"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}
