'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * LazyImage - Lazy-loaded image with shimmer placeholder
 * 
 * Features:
 * - Uses Intersection Observer API for efficient lazy loading
 * - Shows shimmer animation while loading
 * - Handles error states with fallback
 * - Supports all standard img attributes
 * 
 * @example
 * <LazyImage 
 *   src="https://example.com/card.jpg" 
 *   alt="Card name"
 *   className="w-full h-full object-cover"
 * />
 */

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallback?: React.ReactNode;
  threshold?: number; // IntersectionObserver threshold (0-1)
  rootMargin?: string; // IntersectionObserver rootMargin
}

export function LazyImage({
  src,
  alt,
  fallback,
  threshold = 0.01,
  rootMargin = '50px',
  className = '',
  ...props
}: LazyImageProps) {
  const [isInView, setIsInView] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // Skip if no IntersectionObserver support (load immediately)
    if (!('IntersectionObserver' in window)) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        threshold,
        rootMargin,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
  };

  return (
    <div
      ref={imgRef}
      className={`relative overflow-hidden ${className}`}
      style={{ minHeight: '20px' }}
    >
      {/* Shimmer placeholder */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-800 via-neutral-700 to-neutral-800 bg-[length:200%_100%] animate-shimmer" />
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 text-gray-500 text-xs">
          {fallback || (
            <div className="text-center p-2">
              <svg className="w-8 h-8 mx-auto mb-1 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>Image unavailable</div>
            </div>
          )}
        </div>
      )}

      {/* Actual image */}
      {isInView && (
        <img
          src={src}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          className={`${className} ${!isLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
          {...props}
        />
      )}
    </div>
  );
}

/**
 * Shimmer animation keyframes (add to your global CSS or tailwind.config.ts)
 * 
 * @keyframes shimmer {
 *   0% { background-position: 200% 0; }
 *   100% { background-position: -200% 0; }
 * }
 * 
 * Or in tailwind.config.ts:
 * animation: {
 *   shimmer: 'shimmer 2s infinite linear',
 * },
 * keyframes: {
 *   shimmer: {
 *     '0%': { backgroundPosition: '200% 0' },
 *     '100%': { backgroundPosition: '-200% 0' },
 *   },
 * },
 */


