'use client';
import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

function hasConsent(): boolean {
  try { return typeof window !== 'undefined' && window.localStorage.getItem('analytics:consent') === 'granted'; } catch { return false; }
}

function AnalyticsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!hasConsent()) return;
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
