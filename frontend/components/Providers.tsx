'use client';

import React from 'react';
import posthog from 'posthog-js';
import { PrefsProvider } from '@/components/PrefsContext';
import ToastProvider from '@/components/ToastProvider';
import ProProvider from '@/components/ProContext';
import { getConsentStatus, onConsentChange } from '@/lib/consent';

function hasConsent(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    // Use new consent helper for consistency
    return getConsentStatus() === 'accepted';
  } catch {
    // Fallback to legacy check
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem('analytics:consent') === 'granted';
    } catch {
      return false;
    }
  }
}

function initPosthogIfNeeded() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY || '';
  if (!key) return; // no key configured -> do not init
  if (typeof window === 'undefined') return;
  if ((navigator as any)?.onLine === false) return; // offline -> skip init to avoid failed fetch noise

  const ph: any = posthog as any;
  if (ph?._loaded) {
    try {
      (posthog as any).set_config({ capture_pageview: false, disable_toolbar: true, autocapture: false });
      (ph.toolbar && ph.toolbar.close && ph.toolbar.close());
    } catch {}
    return;
  }
  try {
    posthog.init(key, ({
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || '/ingest',
      capture_pageview: false,
      autocapture: false,
      capture_pageleave: true,
      disable_session_recording: true,
      disable_toolbar: true,
      debug: false,
    }) as any);
  } catch {}
}

/**
 * Global app providers.
 * - Ensures PrefsProvider is always present (fixes "usePrefs must be used within PrefsProvider").
 * - Initializes PostHog only after consent.
 * - Adds ToastProvider for global error/success toasts.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    if (typeof window === 'undefined') return; // guard: never run on the server

    // Initialize analytics only with consent; re-check when consent is granted
    const maybeInit = () => {
      if (!hasConsent()) return;
      initPosthogIfNeeded();
      try {
        if (!sessionStorage.getItem('analytics:app_open_sent')) {
          (posthog as any)?.capture?.('app_open');
          sessionStorage.setItem('analytics:app_open_sent','1');
        }
      } catch {}
    };

    // PERFORMANCE: Defer PostHog initialization to after page is interactive
    // This prevents blocking initial page load
    const timeoutId = setTimeout(maybeInit, 1500);
    
    const onGranted = () => { 
      clearTimeout(timeoutId);
      maybeInit(); 
    };
    window.addEventListener('analytics:consent-granted', onGranted);
    
    // Listen for consent changes and re-init/reset PostHog
    const cleanupConsentChange = onConsentChange((status) => {
      if (status === 'accepted') {
        clearTimeout(timeoutId);
        maybeInit();
      } else if (status === 'declined') {
        // Reset PostHog when consent is declined
        try {
          (posthog as any)?.reset?.();
        } catch {}
      }
    });
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('analytics:consent-granted', onGranted);
      cleanupConsentChange();
    };
  }, []);

  return (
    <PrefsProvider>
      <ToastProvider>
        <ProProvider>
          {children}
        </ProProvider>
      </ToastProvider>
    </PrefsProvider>
  );
}
