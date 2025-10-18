'use client';

import { useEffect, useState } from 'react';
import { CostToFinishCoachBubble } from '@/components/CoachBubble';

export default function CollectionPageCoachBubbles({ collectionCount }: { collectionCount: number }) {
  const [showCoach, setShowCoach] = useState(false);

  useEffect(() => {
    // Only show if user has at least 1 collection
    if (collectionCount > 0) {
      const timer = setTimeout(() => {
        setShowCoach(true);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [collectionCount]);

  if (!showCoach) return null;

  return <CostToFinishCoachBubble />;
}

