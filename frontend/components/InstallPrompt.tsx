'use client';

import { useState, useEffect } from 'react';
import { capture } from '@/lib/ph';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      capture('app_opened_standalone');
      return;
    }

    // Check if user has dismissed recently (30 days)
    const dismissedUntil = localStorage.getItem('pwa_install_dismissed_until');
    if (dismissedUntil) {
      const dismissedDate = new Date(dismissedUntil);
      if (dismissedDate > new Date()) {
        setIsDismissed(true);
        return;
      } else {
        // Dismissal period expired, clear it
        localStorage.removeItem('pwa_install_dismissed_until');
      }
    }

    // Track visit count
    const visitCount = parseInt(localStorage.getItem('pwa_visit_count') || '0', 10);
    const newVisitCount = visitCount + 1;
    localStorage.setItem('pwa_visit_count', newVisitCount.toString());

    // Only show after 2-3 visits
    const MIN_VISITS = 2;
    if (newVisitCount < MIN_VISITS) {
      capture('pwa_visit_tracked', { visit_count: newVisitCount });
      return;
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
      
      capture('pwa_install_prompted', { visit_count: newVisitCount });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      capture('pwa_install_accepted');
    } else {
      capture('pwa_install_dismissed');
    }

    // Clear the deferredPrompt
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    
    // Set dismissal to expire in 30 days
    const dismissUntil = new Date();
    dismissUntil.setDate(dismissUntil.getDate() + 30);
    localStorage.setItem('pwa_install_dismissed_until', dismissUntil.toISOString());
    
    // Remove old dismissal key if it exists
    localStorage.removeItem('pwa_install_dismissed');
    
    capture('pwa_install_dismissed', { dismissed_until: dismissUntil.toISOString() });
  };

  if (!isVisible || isDismissed || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 right-4 max-w-sm z-50 animate-slide-up">
      <div className="bg-gradient-to-r from-emerald-600 to-blue-600 text-white rounded-2xl shadow-2xl p-6 border border-white/20">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-white/80 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-start gap-4 mb-4">
          <div className="text-4xl">📱</div>
          <div>
            <h3 className="font-bold text-lg mb-1">Install ManaTap AI</h3>
            <p className="text-sm text-white/90">
              Install our app for quick access and offline support!
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleInstall}
            className="flex-1 bg-white text-emerald-600 font-semibold py-3 px-4 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-3 rounded-lg bg-white/10 hover:bg-white/20 transition-colors font-medium"
          >
            Not now
          </button>
        </div>

        <div className="mt-3 text-xs text-white/70 flex items-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Fast, reliable, works offline
        </div>
      </div>
    </div>
  );
}

