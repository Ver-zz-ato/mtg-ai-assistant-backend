// Client instrumentation entrypoint. We intentionally do NOT auto-init PostHog here.
// PostHog is initialized (if consented + configured) from components/Providers.tsx.
// Exporting the library allows optional direct usage if needed.
import posthog from 'posthog-js';
export default posthog;
