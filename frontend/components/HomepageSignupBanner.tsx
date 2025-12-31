'use client';

import { useAuth } from '@/lib/auth-context';
import { useCapture } from '@/lib/analytics/useCapture';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackSignupStarted } from '@/lib/analytics-enhanced';

export default function HomepageSignupBanner() {
  const { user, loading } = useAuth();
  const capture = useCapture();

  // Only show for guest users (not logged in)
  if (loading || user) {
    return null;
  }

  const handleSignupClick = () => {
    capture(AnalyticsEvents.SIGNUP_CTA_CLICKED, {
      source: 'homepage_banner',
      position: 'above_fold'
    });
    trackSignupStarted('email', 'homepage_banner');
    
    // Trigger signup modal via custom event (Header component listens for this)
    window.dispatchEvent(new CustomEvent('open-auth-modal', { 
      detail: { mode: 'signup' } 
    }));
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 mb-4">
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl p-5 shadow-xl border border-blue-500/30">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Mobile: CTA on top for better thumb reach */}
          <button
            onClick={handleSignupClick}
            className="w-full sm:w-auto px-8 py-3 bg-white text-blue-600 font-bold rounded-lg hover:bg-gray-100 transition-all transform hover:scale-105 active:scale-95 shadow-xl shadow-white/20 whitespace-nowrap relative group sm:hidden"
          >
            <span className="relative z-10">Sign Up Free</span>
            <span className="absolute inset-0 rounded-lg bg-white opacity-0 group-hover:opacity-20 transition-opacity blur-xl"></span>
          </button>
          <div className="flex-1 text-center md:text-left">
            <h3 className="text-2xl font-bold text-white mb-2">
              Save Your Chat History, Build Decks, Track Collections
            </h3>
            <p className="text-blue-100 text-sm md:text-base flex flex-wrap items-center justify-center md:justify-start gap-2">
              <span className="flex items-center gap-1">
                <span>✓</span> Free forever
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span>✓</span> No credit card required
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span>⚡</span> 30 seconds
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span>👥</span> Join 1,000+ MTG players
              </span>
            </p>
          </div>
          {/* Desktop: CTA on right */}
          <button
            onClick={handleSignupClick}
            className="hidden sm:block px-8 py-3 bg-white text-blue-600 font-bold rounded-lg hover:bg-gray-100 transition-all transform hover:scale-105 active:scale-95 shadow-xl shadow-white/20 whitespace-nowrap relative group"
          >
            <span className="relative z-10">Sign Up Free</span>
            <span className="absolute inset-0 rounded-lg bg-white opacity-0 group-hover:opacity-20 transition-opacity blur-xl"></span>
          </button>
        </div>
      </div>
    </div>
  );
}
