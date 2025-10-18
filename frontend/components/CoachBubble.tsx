'use client';

import { useState, useEffect } from 'react';
import { capture } from '@/lib/ph';

interface CoachBubbleProps {
  tipId: string;
  message: string;
  actionText?: string;
  actionUrl?: string;
  maxDismissals?: number;
  onAction?: () => void;
}

export default function CoachBubble({
  tipId,
  message,
  actionText = "Try it now",
  actionUrl,
  maxDismissals = 3,
  onAction,
}: CoachBubbleProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [dismissCount, setDismissCount] = useState(0);

  useEffect(() => {
    // Check localStorage for dismissal count
    const storageKey = `coach_bubble_${tipId}`;
    const stored = localStorage.getItem(storageKey);
    
    if (stored) {
      const count = parseInt(stored, 10);
      setDismissCount(count);
      
      // Don't show if already dismissed max times
      if (count >= maxDismissals) {
        return;
      }
    }

    // Show after a short delay (session-based)
    const sessionKey = `coach_bubble_session_${tipId}`;
    const shownThisSession = sessionStorage.getItem(sessionKey);
    
    if (!shownThisSession) {
      const timer = setTimeout(() => {
        setIsVisible(true);
        sessionStorage.setItem(sessionKey, 'true');
        
        try {
          capture('coach_bubble_shown', { tip_id: tipId });
        } catch {}
      }, 3000); // Show after 3 seconds

      return () => clearTimeout(timer);
    }
  }, [tipId, maxDismissals]);

  const handleDismiss = () => {
    const newCount = dismissCount + 1;
    const storageKey = `coach_bubble_${tipId}`;
    
    localStorage.setItem(storageKey, newCount.toString());
    setDismissCount(newCount);
    setIsVisible(false);
    
    try {
      capture('coach_bubble_dismissed', { 
        tip_id: tipId, 
        dismissal_count: newCount 
      });
    } catch {}
  };

  const handleAction = () => {
    setIsVisible(false);
    
    try {
      capture('coach_bubble_action_clicked', { tip_id: tipId });
    } catch {}
    
    if (onAction) {
      onAction();
    } else if (actionUrl) {
      window.location.href = actionUrl;
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40 animate-in slide-in-from-bottom-5 duration-500">
      <div className="bg-gradient-to-br from-emerald-500 to-blue-600 text-white rounded-2xl shadow-2xl p-4 max-w-xs relative">
        {/* Coach character */}
        <div className="absolute -top-8 -left-8 text-6xl">
          🧙‍♂️
        </div>
        
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-white/80 hover:text-white text-xl leading-none w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
          aria-label="Dismiss"
        >
          ×
        </button>

        <div className="ml-4">
          <p className="text-sm font-medium mb-3 pr-4">
            {message}
          </p>
          
          <div className="flex gap-2">
            <button
              onClick={handleAction}
              className="px-4 py-2 bg-white text-emerald-600 rounded-lg font-semibold text-sm hover:bg-gray-100 transition-colors flex-1"
            >
              {actionText}
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-2 bg-white/20 backdrop-blur text-white rounded-lg font-medium text-sm hover:bg-white/30 transition-colors"
            >
              Later
            </button>
          </div>
          
          {dismissCount > 0 && (
            <p className="text-xs text-white/60 mt-2 text-center">
              {maxDismissals - dismissCount} more reminder{maxDismissals - dismissCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Pre-built coach bubbles for common scenarios
export function MulliganCoachBubble({ deckId }: { deckId?: string }) {
  return (
    <CoachBubble
      tipId="mulligan_simulator"
      message="Try the Mulligan simulator on your deck! Test opening hands with real MTG card art."
      actionText="Open Simulator"
      actionUrl={deckId ? `/my-decks/${deckId}#mulligan` : '/tools/mulligan'}
    />
  );
}

export function BudgetSwapsCoachBubble({ deckId }: { deckId?: string }) {
  return (
    <CoachBubble
      tipId="budget_swaps"
      message="Want to optimize your deck on a budget? Check out our AI-powered Budget Swaps!"
      actionText="See Swaps"
      actionUrl={deckId ? `/deck/swap-suggestions?deckId=${deckId}` : '/deck/swap-suggestions'}
    />
  );
}

export function CostToFinishCoachBubble({ deckId }: { deckId?: string }) {
  return (
    <CoachBubble
      tipId="cost_to_finish"
      message="See exactly what cards you need and what they'll cost with Cost-to-Finish!"
      actionText="Try It"
      actionUrl={deckId ? `/collections/cost-to-finish?deckId=${deckId}` : '/collections/cost-to-finish'}
    />
  );
}

