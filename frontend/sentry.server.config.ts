// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://c12a08c930a7b2441af2a730bd8bc6ef@o4510234321354752.ingest.de.sentry.io/4510234326335568",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  // COST OPTIMIZATION: 10% in production, 100% in dev to avoid Sentry quota overages
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
