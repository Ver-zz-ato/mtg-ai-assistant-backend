// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://c12a08c930a7b2441af2a730bd8bc6ef@o4510234321354752.ingest.de.sentry.io/4510234326335568",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  // COST OPTIMIZATION: 10% in production, 1% in dev to reduce Sentry overhead during development/testing
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.01,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // Filter out harmless connection abort errors (common during test runs)
  // These occur when HTTP connections are aborted (client disconnects) and are not actual errors
  beforeSend(event, hint) {
    const error = hint.originalException as Error & { code?: string; cause?: unknown } | undefined;
    const errorMessage = event.exception?.values?.[0]?.value || '';
    const errorType = event.exception?.values?.[0]?.type || '';
    const culprit = (event as any).culprit || '';

    // Filter out connection abort errors (common in tests when clients disconnect)
    // These are harmless and expected behavior when:
    // - Test clients disconnect
    // - HTTP connections are aborted
    // - Network errors occur during test cleanup
    if (
      errorMessage === 'aborted' ||
      errorMessage.toLowerCase().includes('aborted') ||
      error?.code === 'ECONNRESET' ||
      error?.code === 'EPIPE' ||
      culprit.includes('abortIncoming') ||
      culprit.includes('_http_server')
    ) {
      // These are not real errors - ignore them to reduce noise in Sentry
      return null;
    }

    // "failed to pipe response" when cause is client disconnect (ECONNRESET, terminated)
    // Happens on streaming routes (e.g. /api/chat/stream) when user closes tab, navigates away,
    // or mobile app backgrounds mid-stream. Next.js wraps the underlying error.
    if (errorMessage === 'failed to pipe response') {
      const causeChain = (e: unknown): string[] => {
        if (!e || typeof e !== 'object') return [];
        const err = e as Error & { cause?: unknown };
        const parts = [err.message || '', (err as any).code || ''];
        if (err.cause) parts.push(...causeChain(err.cause));
        return parts;
      };
      const chain = [...causeChain(error), ...(event.exception?.values?.map((v: any) => v?.value || '') ?? [])];
      const hasClientDisconnect = chain.some(
        (s) => s.includes('ECONNRESET') || s.includes('terminated') || s.includes('EPIPE')
      );
      if (hasClientDisconnect) return null;
    }

    return event;
  },
});
