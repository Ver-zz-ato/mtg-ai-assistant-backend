import {withSentryConfig} from "@sentry/nextjs";
import path from "path";
import type { NextConfig } from "next";

// Full Next.js config
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cards.scryfall.io" },
    ],
    minimumCacheTTL: 2592000, // 30 days for better caching
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // Fixes the "workspace root" warnings on Render
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Prevent style-only lint errors from blocking builds
  eslint: { ignoreDuringBuilds: true },
  // Still fail on real TS errors
  typescript: { ignoreBuildErrors: false },
  
  // Performance optimizations
  experimental: {
    // Removed @supabase/supabase-js due to vendor-chunks build error
    optimizePackageImports: ['recharts', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
  },
  staticPageGenerationTimeout: 180,

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
      // Allow scripts from self, Stripe, Ko-fi, and PostHog (for surveys/extensions)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://storage.ko-fi.com https://eu-assets.i.posthog.com",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      // Allow Scryfall API calls and Supabase/PostHog/Sentry + production domain for testing
      "connect-src 'self' https://api.scryfall.com https://eu.i.posthog.com https://eu-assets.i.posthog.com https://*.supabase.co https://*.supabase.in https://app.manatap.ai https://*.ingest.de.sentry.io",
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

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "manatapai",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});