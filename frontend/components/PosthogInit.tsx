'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

export default function PosthogInit() {
  useEffect(() => {
    if (!KEY) return;
    if (typeof window === 'undefined') return;

    try {
      posthog.init(KEY, ({
        api_host: HOST,
        // ui_host is optional; only needed for PostHog UI widgets. Keep disabled toolbar regardless.
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: true,
        disable_toolbar: true,
      }) as any);
      (posthog as any).set_config({ disable_toolbar: true });
    } catch {}
  }, []);

  return null;
}
