'use client';
import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

function AnalyticsInner() {
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

export default function AnalyticsProvider() {
  return (
    <Suspense fallback={null}>
      <AnalyticsInner />
    </Suspense>
  );
}