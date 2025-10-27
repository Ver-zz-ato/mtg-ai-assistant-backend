"use client";

import React from 'react';

interface ShimmerLoaderProps {
  className?: string;
  manaColors?: boolean;
}

/**
 * ShimmerLoader - Animated loading state with gradient shimmer
 * Can use mana colors or default brand gradient
 */
export default function ShimmerLoader({ className = '', manaColors = false }: ShimmerLoaderProps) {
  const gradientColors = manaColors
    ? 'from-red-500/20 via-green-500/20 to-blue-500/20'
    : 'from-[#00e18c]/20 via-[#3affc1]/20 to-[#009f6a]/20';

  return (
    <div className={`relative overflow-hidden bg-neutral-800/50 rounded ${className}`}>
      <div 
        className={`absolute inset-0 bg-gradient-to-r ${gradientColors} animate-shimmer`}
        style={{
          backgroundSize: '200% 100%',
          animation: 'shimmer 2s infinite linear',
        }}
      />
      <style jsx>{`
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite linear;
        }
      `}</style>
    </div>
  );
}

