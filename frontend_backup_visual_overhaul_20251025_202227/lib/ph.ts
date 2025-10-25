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
    // Enrich user properties with app-specific context
    const enrichedProps = {
      ...props,
      $set: {
        ...props?.$set,
        app_version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
        platform: 'web',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
        identified_at: new Date().toISOString(),
      },
      $set_once: {
        ...props?.$set_once,
        first_seen: new Date().toISOString(),
      }
    };
    
    // @ts-ignore
    window.posthog?.identify?.(distinctId, enrichedProps);
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[analytics] identify', distinctId, enrichedProps ?? {});
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
