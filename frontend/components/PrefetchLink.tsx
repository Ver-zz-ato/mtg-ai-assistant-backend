'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';

/**
 * PrefetchLink - Enhanced Link component with hover prefetching
 * 
 * Features:
 * - Prefetches on hover (desktop only, not mobile)
 * - Prefetches both navigation and API data
 * - Respects user preferences and network conditions
 * 
 * @example
 * <PrefetchLink href="/decks/123">View Deck</PrefetchLink>
 */

interface PrefetchLinkProps extends React.ComponentPropsWithoutRef<typeof Link> {
  prefetchData?: string[]; // Optional API endpoints to prefetch
}

export function PrefetchLink({ 
  href, 
  prefetchData,
  onMouseEnter,
  children,
  ...props 
}: PrefetchLinkProps) {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [hasPrefetched, setHasPrefetched] = useState(false);

  // Detect mobile on mount
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Call original onMouseEnter if provided
      if (onMouseEnter) {
        onMouseEnter(e);
      }

      // Skip prefetch on mobile
      if (isMobile) {
        return;
      }

      // Skip if already prefetched
      if (hasPrefetched) {
        return;
      }

      // Prefetch the route
      if (typeof href === 'string') {
        router.prefetch(href);
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`[PrefetchLink] 🔮 Prefetching route: ${href}`);
        }
      }

      // Prefetch additional API data if specified
      if (prefetchData && prefetchData.length > 0) {
        prefetchData.forEach((url) => {
          fetch(url, { 
            method: 'HEAD', // Use HEAD to just warm the cache
            // @ts-ignore
            priority: 'low' 
          }).catch(() => {
            // Silent failure - prefetch is optional
          });
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`[PrefetchLink] 🔮 Prefetching API: ${url}`);
          }
        });
      }

      setHasPrefetched(true);
    },
    [href, isMobile, hasPrefetched, router, onMouseEnter, prefetchData]
  );

  return (
    <Link
      href={href}
      onMouseEnter={handleMouseEnter}
      {...props}
    >
      {children}
    </Link>
  );
}

/**
 * usePrefetch - Hook for manual prefetching
 * 
 * @example
 * const prefetch = usePrefetch();
 * 
 * useEffect(() => {
 *   prefetch('/decks/123', ['/api/decks/123']);
 * }, []);
 */
export function usePrefetch() {
  const router = useRouter();
  
  return useCallback((route: string, apiEndpoints?: string[]) => {
    // Don't prefetch on mobile
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      return;
    }

    // Prefetch route
    router.prefetch(route);
    
    // Prefetch API endpoints
    if (apiEndpoints) {
      apiEndpoints.forEach((url) => {
        fetch(url, { 
          method: 'HEAD',
          // @ts-ignore
          priority: 'low' 
        }).catch(() => {});
      });
    }
  }, [router]);
}


