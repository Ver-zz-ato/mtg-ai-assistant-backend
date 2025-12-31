'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useCapture } from '@/lib/analytics/useCapture';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackSignupStarted } from '@/lib/analytics-enhanced';

interface FloatingSignupPromptProps {
  messageCount?: number;
}

export default function FloatingSignupPrompt({ messageCount = 0 }: FloatingSignupPromptProps) {
  const { user, loading } = useAuth();
  const capture = useCapture();
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Only show for guest users after 3-5 messages
  useEffect(() => {
    if (loading || user || isDismissed) {
      setIsVisible(false);
      return;
    }

    // Show after 3 messages, hide after 10 (user is too engaged or not interested)
    if (messageCount >= 3 && messageCount < 10) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [loading, user, messageCount, isDismissed]);

  const handleSignupClick = () => {
    capture(AnalyticsEvents.SIGNUP_CTA_CLICKED, {
      source: 'floating_prompt',
      message_count: messageCount
    });
    trackSignupStarted('email', 'floating_prompt');
    
    // Trigger signup modal via custom event
    window.dispatchEvent(new CustomEvent('open-auth-modal', { 
      detail: { mode: 'signup' } 
    }));
    
    setIsDismissed(true);
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsVisible(false);
    // Store dismissal in localStorage to prevent showing again this session
    try {
      localStorage.setItem('floatingSignupDismissed', 'true');
    } catch {}
  };

  // Check localStorage on mount
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem('floatingSignupDismissed');
      if (dismissed === 'true') {
        setIsDismissed(true);
      }
    } catch {}
  }, []);

  if (!isVisible) {
    return null;
  }

  // Add pulse animation for 5+ messages (urgency)
  const showUrgency = messageCount >= 5;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
      <div className={`bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl shadow-2xl border border-blue-400/30 p-4 max-w-sm ${showUrgency ? 'ring-2 ring-amber-400/50' : ''}`}>
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-white/80 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        <div className="pr-6">
          <h4 className="text-white font-bold mb-1 text-sm">
            Loving the AI?
          </h4>
          <p className="text-blue-100 text-xs mb-2">
            Sign up free to save your chat history • No credit card required
          </p>
          <p className="text-blue-200 text-xs font-medium mb-3">
            You've sent {messageCount} messages — save them now!
          </p>
          <button
            onClick={handleSignupClick}
            className="w-full bg-white text-blue-600 py-2 px-4 rounded-lg font-semibold text-sm hover:bg-gray-100 transition-colors"
          >
            Sign Up Free
          </button>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
