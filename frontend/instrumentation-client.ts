import posthog from "posthog-js";

// Next.js App Router: this file is auto-loaded on the client.
// We guard against hot-reload double inits in dev.
declare global {
  interface Window { __PH_INIT_DONE__?: boolean }
}

if (typeof window !== "undefined" && !window.__PH_INIT_DONE__) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: "/ingest",            // use Next proxy added by the wizard
    ui_host: "https://eu.posthog.com",
    autocapture: true,
    capture_pageview: false,        // we'll send our own on route changes
    capture_pageleave: true,
    disable_session_recording: true, // keep lightweight
    debug: process.env.NODE_ENV === "development",
  });
  window.__PH_INIT_DONE__ = true;
}

export default posthog;
