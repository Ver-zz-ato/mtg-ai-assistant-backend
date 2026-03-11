"use client";

import React, { useState } from "react";
import BuildDeckFromCollectionModal from "./BuildDeckFromCollectionModal";

interface BuildDeckFromCollectionPanelProps {
  collectionId: string;
}

export default function BuildDeckFromCollectionPanel({ collectionId }: BuildDeckFromCollectionPanelProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="rounded-2xl border-2 border-purple-500/50 bg-gradient-to-br from-purple-950/80 via-indigo-950/60 to-neutral-950 p-6 shadow-xl shadow-purple-500/10">
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl" aria-hidden>✨</span>
            <h3 className="text-xl font-bold text-white">Build a Deck From This Collection</h3>
          </div>
          <p className="text-neutral-200 leading-relaxed mb-4">
            Let AI build a Commander deck using cards you already own. Pick a commander or let us choose one that fits your collection.
          </p>
          <ul className="space-y-2 text-sm text-neutral-300 mb-6">
            <li className="flex items-center gap-2">
              <span className="text-purple-400">•</span> <strong>Guided</strong> — Choose commander, playstyle, power level
            </li>
            <li className="flex items-center gap-2">
              <span className="text-purple-400">•</span> <strong>Build It For Me</strong> — AI picks commander and builds automatically
            </li>
            <li className="flex items-center gap-2">
              <span className="text-purple-400">•</span> <strong>Find My Playstyle</strong> — Take a quiz and get suggestions
            </li>
          </ul>
          <button
            onClick={() => setShowModal(true)}
            className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 hover:from-purple-500 hover:via-pink-500 hover:to-purple-500 text-white font-bold text-lg shadow-lg hover:shadow-purple-500/25 transition-all border border-purple-500/30"
          >
            Build a Deck From This Collection →
          </button>
        </div>
      </div>

      {showModal && (
        <BuildDeckFromCollectionModal collectionId={collectionId} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
