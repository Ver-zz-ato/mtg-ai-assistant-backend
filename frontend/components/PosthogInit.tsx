"use client";
import { useEffect } from "react";
import posthog from "posthog-js";

// Clean init for current posthog-js types:
// - remove session_recording entirely (defaults to off unless explicitly started)
// - keep manual $pageview via your tracker component
export default function PosthogInit() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    posthog.init(key, {
      api_host: "/ingest",
      ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com",
      autocapture: false,
      capture_pageleave: true,
      capture_exceptions: false,
      debug: process.env.NODE_ENV === "development",
    });
  }, []);

  return null;
}
