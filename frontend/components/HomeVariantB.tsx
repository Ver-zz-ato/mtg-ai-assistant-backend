'use client';

import { useEffect, useState } from 'react';
import { useCapture } from '@/lib/analytics/useCapture';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { getHomeVariant, trackHomeVariantViewed, trackHomePrimaryCTAClicked } from '@/lib/analytics/home-experiment';
import SampleDeckSelector from './SampleDeckSelector';

/**
 * Homepage Variant B: Activation-first
 * Shows primary CTA above the fold with example analysis
 */
export default function HomeVariantB() {
  const capture = useCapture();
  const [variant] = useState(() => getHomeVariant());
  
  useEffect(() => {
    if (variant === 'B') {
      trackHomeVariantViewed('B');
    }
  }, [variant]);
  
  if (variant !== 'B') {
    return null; // Variant A (control) handled by main page
  }
  
  const handleAnalyzeDeck = () => {
    trackHomePrimaryCTAClicked('analyze_deck');
    // Scroll to chat or trigger analyze
    const chatInput = document.querySelector('textarea[placeholder*="deck"]') as HTMLTextAreaElement;
    if (chatInput) {
      chatInput.focus();
      chatInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  
  const handleImportSample = () => {
    trackHomePrimaryCTAClicked('import_sample');
    // Trigger sample deck import
    const sampleButton = document.querySelector('[data-sample-deck-button]') as HTMLElement;
    if (sampleButton) {
      sampleButton.click();
    }
  };
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 mb-8">
      <div className="bg-gradient-to-br from-blue-900/30 via-purple-900/20 to-pink-900/30 rounded-2xl border border-blue-800/30 p-8">
        <h2 className="text-3xl font-bold text-white mb-4 text-center">
          Analyze Your Deck Instantly
        </h2>
        <p className="text-center text-gray-300 mb-6">
          Get AI-powered insights on mana curve, synergies, and improvements
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
          <button
            onClick={handleAnalyzeDeck}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold rounded-lg transition-all transform hover:scale-105"
          >
            📊 Analyze a Deck
          </button>
          <button
            onClick={handleImportSample}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-lg transition-all transform hover:scale-105"
          >
            🎴 Try Sample Deck
          </button>
        </div>
        
        {/* Example analysis preview */}
        <div className="bg-neutral-900/50 rounded-lg border border-neutral-700 p-4 mt-6">
          <div className="text-sm text-gray-400 mb-2">Example Analysis:</div>
          <div className="text-xs text-gray-300 space-y-1">
            <div>✅ <strong>Mana Curve:</strong> Well-distributed across 2-4 CMC</div>
            <div>✅ <strong>Ramp:</strong> 10 pieces (optimal for Commander)</div>
            <div>⚠️ <strong>Card Draw:</strong> Consider adding 2-3 more draw effects</div>
            <div>✅ <strong>Removal:</strong> Good mix of targeted and board wipes</div>
          </div>
        </div>
      </div>
    </div>
  );
}
