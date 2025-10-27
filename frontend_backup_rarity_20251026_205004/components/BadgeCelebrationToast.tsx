'use client';

import React, { useState, useEffect } from 'react';
import { capture } from '@/lib/ph';

interface BadgeInfo {
  key: string;
  label: string;
  emoji: string;
  desc: string;
  tier?: string;
  pro_at_unlock?: boolean;
}

interface BadgeCelebrationToastProps {
  badge: BadgeInfo;
  onViewBadge: () => void;
  onShare: () => void;
  onDismiss: () => void;
}

export default function BadgeCelebrationToast({ 
  badge, 
  onViewBadge, 
  onShare, 
  onDismiss 
}: BadgeCelebrationToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Track badge unlocked toast shown
    try {
      capture('badge_unlocked_toast_shown', {
        badge_id: badge.key,
        tier: badge.tier || null,
        pro_at_unlock: badge.pro_at_unlock || false
      });
    } catch (err) {
      console.warn('Failed to capture badge toast shown event:', err);
    }

    // Start entrance animation
    setIsVisible(true);
    const animationTimer = setTimeout(() => setIsAnimating(true), 50);

    // Auto dismiss after 6 seconds
    const dismissTimer = setTimeout(() => {
      handleDismiss();
    }, 6000);

    return () => {
      clearTimeout(animationTimer);
      clearTimeout(dismissTimer);
    };
  }, []);

  const handleDismiss = () => {
    setIsAnimating(false);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss();
    }, 300);
  };

  const handleViewBadge = () => {
    try {
      capture('badge_celebration_action', {
        badge_id: badge.key,
        action: 'view_badge'
      });
    } catch (err) {
      console.warn('Failed to capture view badge event:', err);
    }
    onViewBadge();
    handleDismiss();
  };

  const handleShare = () => {
    try {
      capture('badge_celebration_action', {
        badge_id: badge.key,
        action: 'share_clicked'
      });
    } catch (err) {
      console.warn('Failed to capture share badge event:', err);
    }
    onShare();
  };

  if (!isVisible) return null;

  return (
    <div
      className={`
        fixed top-6 right-6 z-50 max-w-sm w-full
        transform transition-all duration-300 ease-out
        ${isAnimating 
          ? 'translate-x-0 opacity-100 scale-100' 
          : 'translate-x-full opacity-0 scale-95'
        }
        motion-reduce:transition-none motion-reduce:transform-none
      `}
    >
      <div className={`
        bg-gradient-to-br from-emerald-600 to-green-700 
        ${badge.pro_at_unlock ? 'ring-2 ring-amber-500 ring-opacity-50' : ''}
        text-white rounded-lg shadow-2xl p-4 border border-emerald-500/30
        backdrop-blur-sm
      `}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="text-2xl animate-bounce">🎉</div>
            <div className="font-semibold text-sm">Badge unlocked!</div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-emerald-100 hover:text-white text-xl leading-none focus:outline-none focus:ring-2 focus:ring-white/20 rounded"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>

        {/* Badge Info */}
        <div className="flex items-center gap-3 mb-3">
          <div className={`
            text-3xl p-2 rounded-full bg-white/20
            ${badge.pro_at_unlock 
              ? 'ring-2 ring-amber-400 bg-gradient-to-br from-amber-50/20 to-amber-100/20' 
              : ''
            }
          `}>
            {badge.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg truncate">{badge.label}</div>
            <div className="text-emerald-100 text-sm opacity-90">{badge.desc}</div>
            {badge.pro_at_unlock && (
              <div className="flex items-center gap-1 mt-1">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
                <div className="text-xs text-amber-200 font-medium">Pro Member Bonus</div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleViewBadge}
            className="flex-1 px-3 py-2 bg-white/20 hover:bg-white/30 rounded transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50"
          >
            View badge
          </button>
          <button
            onClick={handleShare}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-white/50"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for managing multiple badge toasts
export function useBadgeCelebration() {
  const [toasts, setToasts] = useState<Array<{ id: string; badge: BadgeInfo }>>([]);

  const showBadgeCelebration = (badge: BadgeInfo) => {
    const id = `badge-${badge.key}-${Date.now()}`;
    setToasts(prev => [...prev, { id, badge }]);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const ToastContainer = ({ onViewBadge, onShare }: {
    onViewBadge: (badge: BadgeInfo) => void;
    onShare: (badge: BadgeInfo) => void;
  }) => (
    <div className="fixed top-0 right-0 z-50 p-4 space-y-4 pointer-events-none">
      {toasts.map(({ id, badge }, index) => (
        <div key={id} className="pointer-events-auto" style={{ marginTop: `${index * 10}px` }}>
          <BadgeCelebrationToast
            badge={badge}
            onViewBadge={() => onViewBadge(badge)}
            onShare={() => onShare(badge)}
            onDismiss={() => dismissToast(id)}
          />
        </div>
      ))}
    </div>
  );

  return {
    showBadgeCelebration,
    ToastContainer,
    activeToastsCount: toasts.length
  };
}