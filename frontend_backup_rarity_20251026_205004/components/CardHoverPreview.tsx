"use client";

import React from 'react';

interface CardHoverPreviewProps {
  cardName: string;
  imageUrl?: string;
  x: number;
  y: number;
}

/**
 * CardHoverPreview - Reusable component for displaying full card images on hover
 * Extracted from Chat.tsx for consistent card previews across the app
 */
export default function CardHoverPreview({ cardName, imageUrl, x, y }: CardHoverPreviewProps) {
  if (!imageUrl) return null;

  // Position intelligently to avoid viewport edges
  const [adjustedX, adjustedY] = React.useMemo(() => {
    const cardWidth = 256; // w-64 = 16rem = 256px
    const cardHeight = 357; // Approximate card height
    const padding = 16;
    
    let newX = x;
    let newY = y;
    
    // Check right edge
    if (typeof window !== 'undefined') {
      if (newX + cardWidth + padding > window.innerWidth) {
        newX = x - cardWidth - padding;
      }
      
      // Check bottom edge
      if (newY + cardHeight + padding > window.innerHeight) {
        newY = window.innerHeight - cardHeight - padding;
      }
      
      // Check top edge
      if (newY < padding) {
        newY = padding;
      }
      
      // Check left edge
      if (newX < padding) {
        newX = padding;
      }
    }
    
    return [newX, newY];
  }, [x, y]);

  return (
    <div
      className="fixed pointer-events-none z-50 transition-opacity duration-200"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <img
        src={imageUrl}
        alt={cardName}
        className="w-64 rounded-lg shadow-2xl border-2 border-neutral-700"
      />
    </div>
  );
}

