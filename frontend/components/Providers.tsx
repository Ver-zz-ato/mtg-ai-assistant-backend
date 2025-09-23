'use client';

import React from 'react';
import posthog from 'posthog-js';
import { PrefsProvider } from '@/components/PrefsContext';

/**
 * Global app providers.
 * - Ensures PrefsProvider is always present (fixes "usePrefs must be used within PrefsProvider").
 * - Initializes PostHog *only in the browser* and force-disables the toolbar so it can't block UI.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    if (typeof window === 'undefined') return; // guard: never run on the server

    // Init once; if already loaded (HMR), just enforce config.
    const ph: any = posthog as any;
    if (!ph?._loaded) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY || '', ({
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        capture_pageview: false,
        disable_toolbar: true,
      }) as any);
    } else {
      (posthog as any).set_config({ capture_pageview: false, disable_toolbar: true });
      try { (ph.toolbar && ph.toolbar.close && ph.toolbar.close()); } catch {}
    }
  }, []);

  return <PrefsProvider>{children}</PrefsProvider>;
}
