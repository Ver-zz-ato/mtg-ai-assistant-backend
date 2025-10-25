'use client';

import { useState, useEffect } from 'react';
import { capture } from '@/lib/ph';

export default function IOSInstallPrompt() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Detect iOS Safari (not in standalone mode)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (!isIOS || isInStandaloneMode || !isSafari) {
      return;
    }

    // Check if user has dismissed recently (30 days)
    const dismissedUntil = localStorage.getItem('ios_pwa_dismissed_until');
    if (dismissedUntil) {
      const dismissedDate = new Date(dismissedUntil);
      if (dismissedDate > new Date()) {
        setIsDismissed(true);
        return;
      } else {
        localStorage.removeItem('ios_pwa_dismissed_until');
      }
    }

    // Track visit count
    const visitCount = parseInt(localStorage.getItem('ios_pwa_visit_count') || '0', 10);
    const newVisitCount = visitCount + 1;
    localStorage.setItem('ios_pwa_visit_count', newVisitCount.toString());

    // Only show after 3 visits
    const MIN_VISITS = 3;
    if (newVisitCount < MIN_VISITS) {
      capture('ios_pwa_visit_tracked', { visit_count: newVisitCount });
      return;
    }

    // Show the prompt
    setIsVisible(true);
    capture('ios_pwa_prompted', { visit_count: newVisitCount });
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    
    // Set dismissal to expire in 30 days
    const dismissUntil = new Date();
    dismissUntil.setDate(dismissUntil.getDate() + 30);
    localStorage.setItem('ios_pwa_dismissed_until', dismissUntil.toISOString());
    
    capture('ios_pwa_dismissed');
  };

  const handleGotIt = () => {
    capture('ios_pwa_instructions_viewed');
    handleDismiss();
  };

  if (!isVisible || isDismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9999] p-4 bg-black/90 backdrop-blur-sm animate-slide-up">
      <div className="max-w-md mx-auto bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl p-6 text-white shadow-2xl border border-white/20">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-white/80 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-start gap-4 mb-4">
          <div className="text-5xl">📱</div>
          <div>
            <h3 className="font-bold text-xl mb-2">Add ManaTap to Home Screen</h3>
            <p className="text-sm text-white/90 mb-4">
              Get quick access and work offline!
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-white/10 rounded-lg p-4 mb-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 font-bold">
              1
            </div>
            <div className="text-sm">
              <p className="font-semibold mb-1">Tap the Share button</p>
              <div className="flex items-center gap-2 text-white/80">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75z" />
                  <path d="M6.25 21a.75.75 0 000 1.5h11.5a.75.75 0 000-1.5H6.25z" />
                </svg>
                <span className="text-xs">(at the bottom of Safari)</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 font-bold">
              2
            </div>
            <div className="text-sm">
              <p className="font-semibold mb-1">Scroll and tap "Add to Home Screen"</p>
              <div className="flex items-center gap-2 text-white/80">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="text-xs">Look for the plus icon</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 font-bold">
              3
            </div>
            <div className="text-sm">
              <p className="font-semibold mb-1">Tap "Add"</p>
              <p className="text-xs text-white/80">ManaTap will appear on your home screen!</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleGotIt}
          className="w-full bg-white text-blue-600 font-bold py-3 px-4 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Got it!
        </button>
      </div>
    </div>
  );
}

