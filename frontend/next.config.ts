import path from "path";
import type { NextConfig } from "next";

// Full Next.js config
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cards.scryfall.io" },
    ],
  },
  // Fixes the “workspace root” warnings on Render
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Prevent style-only lint errors from blocking builds
  eslint: { ignoreDuringBuilds: true },
  // Still fail on real TS errors
  typescript: { ignoreBuildErrors: false },

  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,

  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      // Images from Scryfall (cards + SVG mana symbols) and data URIs
      "img-src 'self' data: https://cards.scryfall.io https://svgs.scryfall.io",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://storage.ko-fi.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      // Allow Scryfall API calls and Supabase/PostHog + production domain for testing
      "connect-src 'self' https://api.scryfall.com https://eu.i.posthog.com https://*.supabase.co https://*.supabase.in https://app.manatap.ai",
      "frame-src https://js.stripe.com https://ko-fi.com",
    ].join('; ');
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
