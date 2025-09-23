'use client';

// Lightweight PostHog helpers with consent guard.
// Safe to import from any client component.

type Props = Record<string, any> | undefined;

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

export function hasConsent(): boolean {
  if (!hasWindow()) return false;
  try {
    return window.localStorage.getItem('analytics:consent') === 'granted';
  } catch {
    return false;
  }
}

export function capture(event: string, props?: Props): void {
  if (!hasWindow() || !hasConsent()) return;
  try {
    // @ts-ignore - posthog is attached globally by the provider init
    window.posthog?.capture?.(event, props);
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[analytics] %s', event, props ?? {});
    }
  } catch {}
}

export function identify(distinctId: string, props?: Props): void {
  if (!hasWindow() || !hasConsent()) return;
  try {
    // @ts-ignore
    window.posthog?.identify?.(distinctId, props);
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[analytics] identify', distinctId, props ?? {});
    }
  } catch {}
}

export function reset(): void {
  if (!hasWindow() || !hasConsent()) return;
  try {
    // @ts-ignore
    window.posthog?.reset?.();
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[analytics] reset');
    }
  } catch {}
}
