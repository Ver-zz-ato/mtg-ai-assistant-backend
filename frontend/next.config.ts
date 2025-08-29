// Allow Scryfall images in <Image />
export default {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cards.scryfall.io" },
    ],
  },
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
} satisfies import("next").NextConfig;
