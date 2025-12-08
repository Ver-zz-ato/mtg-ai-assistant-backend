'use client';
import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { capture } from '@/lib/ph';
import { AnalyticsEvents } from '@/lib/analytics/events';

/**
 * Single pageview tracker component
 * 
 * Tracks pageviews on route changes using the centralized capture() helper
 * and AnalyticsEvents constant to prevent duplicates.
 */
function AnalyticsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const href = typeof window !== 'undefined' ? window.location.href : (pathname || '/');
    capture(AnalyticsEvents.PAGE_VIEW, { $current_url: href });
  }, [pathname, searchParams?.toString()]);
  
  return null;
}

export default function AnalyticsProvider() {
  return (
    <Suspense fallback={null}>
      <AnalyticsInner />
    </Suspense>
  );
}
