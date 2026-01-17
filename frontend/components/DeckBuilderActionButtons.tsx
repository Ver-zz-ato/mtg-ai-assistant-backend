'use client';

import { useState } from 'react';

export default function DeckBuilderActionButtons() {
  const [showQuizModal, setShowQuizModal] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
      {/* Start with a Sample Deck button */}
      {(() => {
        try {
          const { SampleDeckButton } = require('./SampleDeckSelector');
          return <SampleDeckButton className="w-full sm:w-auto" />;
        } catch {
          return null;
        }
      })()}

      {/* FIND MY Playstyle button */}
      {(() => {
        try {
          const PlaystyleQuizModal = require('./PlaystyleQuizModal').default;
          return (
            <>
              <button
                onClick={() => setShowQuizModal(true)}
                className="relative px-6 py-3 w-full sm:w-auto bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 text-white rounded-xl font-bold text-base hover:from-purple-500 hover:via-pink-500 hover:to-purple-500 transition-all shadow-xl hover:shadow-purple-500/50 hover:scale-105 transform duration-200 border-2 border-purple-400/50"
              >
                <span className="relative z-10 flex items-center gap-2 justify-center">
                  <span>🎯</span>
                  <span>
                    <span className="block text-yellow-300 text-xs font-extrabold uppercase tracking-wider mb-0.5">FIND MY</span>
                    <span>Playstyle</span>
                  </span>
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 opacity-0 hover:opacity-100 transition-opacity blur-xl"></div>
              </button>
              {showQuizModal && <PlaystyleQuizModal onClose={() => setShowQuizModal(false)} />}
            </>
          );
        } catch {
          return null;
        }
      })()}
    </div>
  );
}
