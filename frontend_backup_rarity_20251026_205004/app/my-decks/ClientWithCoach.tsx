'use client';

import { useEffect, useState } from 'react';
import { MulliganCoachBubble, BudgetSwapsCoachBubble } from '@/components/CoachBubble';

export default function DeckPageCoachBubbles({ deckCount }: { deckCount: number }) {
  const [showCoach, setShowCoach] = useState(false);

  useEffect(() => {
    // Only show coach bubbles if user has at least 1 deck
    if (deckCount > 0) {
      // Randomly choose which coach bubble to show (50/50 split)
      const timer = setTimeout(() => {
        setShowCoach(true);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [deckCount]);

  if (!showCoach) return null;

  // Show mulligan coach 50% of the time, budget swaps 50%
  return Math.random() > 0.5 ? <MulliganCoachBubble /> : <BudgetSwapsCoachBubble />;
}

