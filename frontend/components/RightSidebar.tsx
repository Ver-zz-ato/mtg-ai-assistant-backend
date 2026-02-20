"use client";
import { useEffect, useState } from "react";
import DeckAnalyzerExpandable from "./DeckAnalyzerExpandable";
import HomepageFAQ from "./HomepageFAQ";
import MulliganDeckInput from "./mulligan/MulliganDeckInput";

export default function RightSidebar() {
  const [debugSpace, setDebugSpace] = useState<boolean>(false);
  const [isCardPanelCollapsed, setIsCardPanelCollapsed] = useState<boolean>(false);
  const [handTestCollapsed, setHandTestCollapsed] = useState<boolean>(true);

  // capture ?dbg=space for spacing debug
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const q = new URLSearchParams(window.location.search);
        if ((q.get('dbg') || '').toLowerCase() === 'space') setDebugSpace(true);
      }
    } catch {}
  }, []);

  // Load collapsed state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('custom_card_panel_collapsed');
      if (stored === 'true') {
        setIsCardPanelCollapsed(true);
      }
    } catch {}
  }, []);

  const toggleCardPanel = () => {
    const newState = !isCardPanelCollapsed;
    setIsCardPanelCollapsed(newState);
    try {
      localStorage.setItem('custom_card_panel_collapsed', String(newState));
    } catch {}
  };

  return (
    <div className={`flex flex-col w-full gap-4 relative z-0 ${debugSpace ? 'bg-yellow-900/5' : ''}`}>
      {/* FAQ Section - collapsed by default */}
      <div className="w-full">
        <HomepageFAQ defaultCollapsed={true} />
      </div>

      {/* Hand Testing Widget - compact demo, collapsible on mobile */}
      <div className={`w-full ${debugSpace ? "outline outline-2 outline-amber-500" : ""}`}>
        <div className="lg:hidden">
          <button
            onClick={() => setHandTestCollapsed(!handTestCollapsed)}
            className="w-full flex items-center justify-between p-3 bg-neutral-900/60 border border-neutral-700 rounded-xl hover:bg-neutral-800/60 transition-colors"
          >
            <h3 className="text-sm font-medium text-amber-200">Try a quick opening-hand test</h3>
            <svg
              className={`w-5 h-5 text-neutral-400 transition-transform ${handTestCollapsed ? "" : "rotate-180"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className={`overflow-hidden transition-all ${handTestCollapsed ? "max-h-0" : "max-h-[800px]"}`}>
            <div className="pt-3">
              <MulliganDeckInput />
            </div>
          </div>
        </div>
        <div className="hidden lg:block">
          <MulliganDeckInput />
        </div>
      </div>

      {/* Deck Snapshot: Expandable analyzer panel */}
      <div className={`${debugSpace ? 'outline outline-2 outline-fuchsia-500 ' : ''}w-full relative z-20`}>
        <DeckAnalyzerExpandable />
      </div>

      {/* Custom Card Creator promo panel - lighter, playful styling */}
      <div className={`relative z-20 bg-neutral-900/40 border border-neutral-700/50 rounded-xl overflow-hidden transition-all duration-300 ${debugSpace ? 'outline outline-2 outline-sky-500' : ''}`}>
        <button
          onClick={toggleCardPanel}
          className="w-full flex items-center justify-between p-3 hover:bg-neutral-800/50 transition-colors"
        >
          <h3 className="text-sm font-medium text-neutral-300 opacity-80">🎨 Custom Card Creator</h3>
          <svg
            className={`w-5 h-5 text-neutral-400 transition-transform duration-300 ${isCardPanelCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div className={`transition-all duration-300 overflow-hidden ${isCardPanelCollapsed ? 'max-h-0' : 'max-h-[2000px]'}`}>
          <div className="p-4 pt-0">
            {debugSpace && (
              <>
                {require('react').createElement('div', { key:'top', className:'absolute -top-1 left-0 right-0 h-0.5 bg-sky-500/70' })}
                {require('react').createElement('div', { key:'bot', className:'absolute -bottom-1 left-0 right-0 h-0.5 bg-sky-500/70' })}
              </>
            )}
            {require('react').createElement(require('./CustomCardCreator').default, { compact: true })}
          </div>
        </div>
      </div>

    </div>
  );
}
