// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://c12a08c930a7b2441af2a730bd8bc6ef@o4510234321354752.ingest.de.sentry.io/4510234326335568",

  // Add optional integrations for additional features
  integrations: [
    Sentry.replayIntegration(),
  ],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  // COST OPTIMIZATION: 10% in production, 1% in dev to reduce Sentry overhead during development/testing
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.01,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // Filter out malicious external script errors (not from our codebase)
  // These are typically injected by browser extensions, adware, or malware
  beforeSend(event, hint) {
    // Ignore errors from known malicious domains (browser extension/adware injection)
    const maliciousDomains = [
      'sevendata.fun',
      'secdomcheck.online',
    ];
    
    // Build a comprehensive search string from all error-related fields
    const errorValue = event.exception?.values?.[0]?.value || '';
    const errorType = event.exception?.values?.[0]?.type || '';
    // Access title and message safely (they may not be on the base Event type)
    const eventTitle = (event as any).title || '';
    const eventMessage = (event as any).message || '';
    const originalException = hint.originalException as Error | undefined;
    const errorUrl = originalException?.message || '';
    
    // Combine all text fields for searching
    const fullErrorText = (
      errorValue + ' ' + 
      errorType + ' ' + 
      eventTitle + ' ' + 
      eventMessage + ' ' + 
      errorUrl
    ).toLowerCase();
    
    // Check if any malicious domain appears in the error text
    if (maliciousDomains.some(domain => fullErrorText.includes(domain.toLowerCase()))) {
      // These are not our errors - ignore them to reduce noise in Sentry
      return null;
    }
    
    // Check breadcrumbs for malicious domain requests
    if (event.breadcrumbs) {
      const hasMaliciousRequest = event.breadcrumbs.some(breadcrumb => {
        const url = breadcrumb.data?.url || '';
        const method = breadcrumb.data?.method || '';
        return maliciousDomains.some(domain => 
          url.toLowerCase().includes(domain.toLowerCase()) ||
          method.toLowerCase().includes(domain.toLowerCase())
        );
      });
      if (hasMaliciousRequest) {
        return null;
      }
    }
    
    // Check request URL if present
    if (event.request?.url) {
      const requestUrl = event.request.url.toLowerCase();
      if (maliciousDomains.some(domain => requestUrl.includes(domain.toLowerCase()))) {
        return null;
      }
    }
    
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

// Client instrumentation entrypoint. We intentionally do NOT auto-init PostHog here.
// PostHog is initialized (if consented + configured) from components/Providers.tsx.
// Exporting the library allows optional direct usage if needed.
import posthog from 'posthog-js';
export default posthog;
