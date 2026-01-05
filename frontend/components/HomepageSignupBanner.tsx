'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useCapture } from '@/lib/analytics/useCapture';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackSignupStarted } from '@/lib/analytics-enhanced';

export default function HomepageSignupBanner() {
  const { user, loading } = useAuth();
  const capture = useCapture();
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollTriggeredRef = useRef(false);
  const messageTriggeredRef = useRef(false);

  useEffect(() => {
    // Only set up listeners for guest users (not logged in)
    if (loading || user) {
      return;
    }
    // Listen for first message sent
    const handleFirstMessage = () => {
      if (!messageTriggeredRef.current) {
        messageTriggeredRef.current = true;
        triggerExpansion('first_message');
      }
    };

    // Listen for scroll past hero (approximately 400px scroll)
    const handleScroll = () => {
      if (!scrollTriggeredRef.current && window.scrollY > 400) {
        scrollTriggeredRef.current = true;
        triggerExpansion('scroll');
      }
    };

    // 25 second timer (middle of 20-30 range)
    timeoutRef.current = setTimeout(() => {
      if (!hasTriggered) {
        triggerExpansion('timer');
      }
    }, 25000);

    window.addEventListener('message-sent', handleFirstMessage);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      window.removeEventListener('message-sent', handleFirstMessage);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [hasTriggered, loading, user]);

  // Only show for guest users (not logged in)
  if (loading || user) {
    return null;
  }

  const triggerExpansion = (trigger: 'first_message' | 'scroll' | 'timer') => {
    if (hasTriggered) return;
    setHasTriggered(true);
    setIsExpanded(true);
    
    capture(AnalyticsEvents.SIGNUP_CTA_CLICKED, {
      source: 'homepage_banner',
      trigger: trigger,
      position: 'delayed_expansion'
    });
  };

  const handleSignupClick = () => {
    capture(AnalyticsEvents.SIGNUP_CTA_CLICKED, {
      source: 'homepage_banner',
      position: isExpanded ? 'expanded' : 'collapsed'
    });
    trackSignupStarted('email', 'homepage_banner');
    
    // Trigger signup modal via custom event (Header component listens for this)
    window.dispatchEvent(new CustomEvent('open-auth-modal', { 
      detail: { mode: 'signup' } 
    }));
  };

  // Collapsed state: reduced visual weight (smaller height, softer gradient)
  if (!isExpanded) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 mb-3">
        <div className="bg-gradient-to-r from-blue-600/60 via-purple-600/60 to-pink-600/60 rounded-xl p-3 shadow-lg border border-blue-500/20 backdrop-blur-sm transition-all duration-500">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 text-center md:text-left">
              <p className="text-white/90 text-sm font-medium">
                Sign up for free to save your chat history
              </p>
            </div>
            <button
              onClick={handleSignupClick}
              className="px-6 py-2 bg-white/90 text-blue-600 font-semibold rounded-lg hover:bg-white transition-all text-sm whitespace-nowrap"
            >
              Sign Up For Free
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Expanded state: full banner (re-surfaced aggressively)
  return (
    <div className="max-w-[1600px] mx-auto px-4 mb-8 animate-slide-down">
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl p-5 shadow-xl border border-blue-500/30 ring-2 ring-blue-400/50">
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
      
      <style jsx>{`
        @keyframes slide-down {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-down {
          animation: slide-down 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
