'use client';
import React, { useState } from 'react';
import { usePro } from '@/components/ProContext';
import { capture } from '@/lib/ph';

interface ProBadgeProps {
  showUpgradeTooltip?: boolean;
}

export default function ProBadge({ showUpgradeTooltip = false }: ProBadgeProps) {
  const { isPro, loading } = usePro();
  const [showTooltip, setShowTooltip] = useState(false);

  if (loading) {
    return (
      <span className="inline-flex items-center rounded bg-gray-300 text-gray-600 text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-wide animate-pulse">
           
      </span>
    );
  }

  // For Pro users, show Pro badge
  if (isPro) {
    return (
      <span className="inline-flex items-center rounded bg-amber-300 text-black text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-wide">
        Pro
      </span>
    );
  }

  // For non-Pro users, show upgrade option if enabled
  if (showUpgradeTooltip) {
    return (
      <div className="relative inline-flex">
        <button
          className="inline-flex items-center rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-wide transition-colors"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={() => {
            try {
              capture('pro_badge_upgrade_clicked', { source: 'pro_badge' });
            } catch {}
            window.location.href = '/pricing';
          }}
        >
          Upgrade
        </button>
        
        {showTooltip && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50">
            <div className="font-semibold mb-1">🚀 Upgrade to Pro</div>
            <div className="text-[11px] opacity-90 mb-2 max-w-xs">
              • Unlimited AI analysis<br/>
              • Advanced deck statistics<br/>
              • Price tracking & alerts<br/>
              • Priority support
            </div>
            <div className="text-[11px] text-blue-300 font-semibold">Starting at $9.99/month</div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        )}
      </div>
    );
  }

  // For non-Pro users without upgrade tooltip, show nothing
  return null;
}
