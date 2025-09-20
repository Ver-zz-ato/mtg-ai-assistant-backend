'use client';
import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

function TrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const href = typeof window !== 'undefined' ? window.location.href : (pathname || '/');
    try {
      posthog.capture('$pageview', { $current_url: href });
    } catch {}
  }, [pathname, searchParams?.toString()]);

  return null;
}

export default function PostHogRouteTracker() {
  return (
    <Suspense fallback={null}>
      <TrackerInner />
    </Suspense>
  );
}