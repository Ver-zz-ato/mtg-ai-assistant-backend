'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number; // Height of each item in pixels
  containerHeight: number; // Height of the visible container
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number; // Number of items to render outside visible area (default: 3)
  threshold?: number; // Minimum number of items before virtualization kicks in (default: 50)
}

/**
 * Virtual List Component - Only renders visible items for performance
 * Only activates when items.length >= threshold (default 50)
 */
export function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 3,
  threshold = 50,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // If items are below threshold, render all items normally
  if (items.length < threshold) {
    return (
      <div
        ref={containerRef}
        style={{
          height: `${containerHeight}px`,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {items.map((item, index) => (
          <div key={index} style={{ height: `${itemHeight}px` }}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    );
  }

  // Virtual scrolling logic for large lists
  const totalHeight = items.length * itemHeight;
  
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = items.slice(startIndex, endIndex + 1);
  const offsetY = startIndex * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        height: `${containerHeight}px`,
        overflow: 'auto',
        position: 'relative',
      }}
    >
      {/* Spacer for total height */}
      <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
        {/* Visible items container */}
        <div
          style={{
            position: 'absolute',
            top: `${offsetY}px`,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((item, index) => (
            <div key={startIndex + index} style={{ height: `${itemHeight}px` }}>
              {renderItem(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to detect if virtual scrolling should be used
 */
export function useVirtualScrolling(itemCount: number, threshold = 50): boolean {
  return itemCount >= threshold;
}


