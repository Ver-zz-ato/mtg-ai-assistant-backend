'use client';

import { useProStatus } from '@/hooks/useProStatus';
import { useCapture } from '@/lib/analytics/useCapture';
import { AnalyticsEvents } from '@/lib/analytics/events';
import Link from 'next/link';

interface ProUpsellBannerProps {
  context: 'deck_page' | 'collections' | 'cost_to_finish';
  deckCount?: number;
}

export default function ProUpsellBanner({ context, deckCount }: ProUpsellBannerProps) {
  const { isPro } = useProStatus();
  const capture = useCapture();

  // Don't show for PRO users
  if (isPro) {
    return null;
  }

  const handleUpgradeClick = () => {
    capture(AnalyticsEvents.PRICING_UPGRADE_CLICKED, {
      source: 'pro_upsell_banner',
      context
    });
    // Navigation happens via Link component
  };

  const getMessage = () => {
    switch (context) {
      case 'deck_page':
        if (deckCount && deckCount >= 3) {
          return 'You\'re building amazing decks! Unlock unlimited AI analysis and advanced tools with Pro.';
        }
        return 'Unlock unlimited AI analysis, hand testing, and price tracking with Pro.';
      case 'collections':
        return 'Track prices with Pro - Get historical price data and alerts for your collection.';
      case 'cost_to_finish':
        return 'See price trends and get alerts with Pro - Track your collection value over time.';
      default:
        return 'Unlock unlimited AI analysis and advanced features with Pro.';
    }
  };

  return (
    <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-lg p-4 mb-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex-1 text-center sm:text-left">
          <p className="text-white font-semibold text-sm mb-1">
            {getMessage()}
          </p>
          <p className="text-blue-200 text-xs">
            Just £1.99/mo • Cancel anytime
          </p>
        </div>
        <Link
          href="/pricing"
          onClick={handleUpgradeClick}
          className="px-4 py-2 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors text-sm whitespace-nowrap"
        >
          Upgrade to Pro
        </Link>
      </div>
    </div>
  );
}
