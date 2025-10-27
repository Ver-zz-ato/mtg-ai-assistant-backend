'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { BadgeProgress } from '@/lib/badge-calculator';

export default function BadgeProgressWidget() {
  const [badges, setBadges] = useState<BadgeProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBadges();
  }, []);

  async function loadBadges() {
    try {
      setLoading(true);
      const response = await fetch('/api/profile/badge-progress');
      const data = await response.json();

      if (data.ok) {
        setBadges(data.badges || []);
      }
    } catch (err) {
      console.error('Error loading badge progress:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <span>🏆</span> Achievement Progress
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse space-y-2">
              <div className="h-4 bg-neutral-800 rounded w-3/4"></div>
              <div className="h-2 bg-neutral-800 rounded w-full"></div>
              <div className="h-3 bg-neutral-800 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (badges.length === 0) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <span>🏆</span> Achievement Progress
        </h3>
        <p className="text-xs text-gray-400">
          Start building decks to unlock achievements!
        </p>
      </div>
    );
  }

  // Show top 3 closest to completion
  const topThree = badges.slice(0, 3);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span>🏆</span> Achievement Progress
        </h3>
        <Link 
          href="/profile#badges"
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          View All →
        </Link>
      </div>

      <div className="space-y-4">
        {topThree.map((badge) => (
          <div key={badge.id} className="space-y-2">
            {/* Badge Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{badge.icon}</span>
                <div>
                  <h4 className="text-sm font-medium text-white">{badge.name}</h4>
                  <p className="text-xs text-gray-400">{badge.description}</p>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                  style={{ width: `${badge.progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">
                  {badge.current} / {badge.target}
                </span>
                <span className="text-gray-400 font-mono">
                  {Math.round(badge.progress)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {badges.length > 3 && (
        <div className="mt-3 pt-3 border-t border-neutral-800 text-center">
          <Link
            href="/profile#badges"
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            +{badges.length - 3} more achievements available
          </Link>
        </div>
      )}
    </div>
  );
}


