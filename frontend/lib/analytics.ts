// lib/analytics.ts
let enabled = false;
let trackImpl: ((ev: string, props?: Record<string, any>) => void) | null = null;

export function initAnalytics() {
  if (typeof window === 'undefined') return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  // lazy import to keep bundle slim if unused
  import('posthog-js').then(({ default: posthog }) => {
    posthog.init(key, { api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com' });
    trackImpl = (ev, props) => posthog.capture(ev, props);
    enabled = true;
  }).catch(() => {});
}

export function track(ev: string, props?: Record<string, any>) {
  if (enabled && trackImpl) trackImpl(ev, props);
}
