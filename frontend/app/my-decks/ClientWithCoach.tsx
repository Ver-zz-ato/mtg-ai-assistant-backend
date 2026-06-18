'use client';

import { useEffect, useState } from 'react';
import { MulliganCoachBubble, BudgetSwapsCoachBubble } from '@/components/CoachBubble';

type CoachVariant = 'mulligan' | 'budget';

export default function DeckPageCoachBubbles({ deckCount }: { deckCount: number }) {
  const [showCoach, setShowCoach] = useState(false);
  const [variant, setVariant] = useState<CoachVariant | null>(null);

  useEffect(() => {
    if (deckCount <= 0) {
      setShowCoach(false);
      setVariant(null);
      return;
    }

    const timer = setTimeout(() => {
      setVariant(Math.random() > 0.5 ? 'mulligan' : 'budget');
      setShowCoach(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, [deckCount]);

  if (!showCoach || !variant) return null;

  return variant === 'mulligan' ? <MulliganCoachBubble /> : <BudgetSwapsCoachBubble />;
}

