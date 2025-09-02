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
};

export default nextConfig;
