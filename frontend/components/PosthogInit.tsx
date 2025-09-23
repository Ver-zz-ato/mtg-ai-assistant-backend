'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

export default function PosthogInit() {
  useEffect(() => {
    if (!KEY) return;
    if (typeof window === 'undefined') return;

    try {
      posthog.init(KEY, ({
        api_host: '/ingest',
        ui_host: 'https://eu.posthog.com',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: true,
        disable_toolbar: true, // kill the toolbar at the source
      }) as any);
      // hard kill in case toolbar was already enabled from a previous session
      (posthog as any).set_config({ disable_toolbar: true });
    } catch {}
  }, []);

  return null;
}