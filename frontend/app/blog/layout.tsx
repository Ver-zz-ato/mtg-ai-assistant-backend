import type { Metadata } from "next";
import {
  SOCIAL_PREVIEW_OG_IMAGE,
  SOCIAL_PREVIEW_TWITTER_IMAGE_URL,
} from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "MTG Deck Building Blog | ManaTap AI",
  description:
    "Tips, strategies, and insights to help you build better Magic: The Gathering decks. Budget building, mana curve, commander guides, and more.",
  alternates: { canonical: "https://www.manatap.ai/blog" },
  openGraph: {
    url: "https://www.manatap.ai/blog",
    siteName: "ManaTap AI",
    type: "website",
    images: [SOCIAL_PREVIEW_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "MTG Deck Building Blog | ManaTap AI",
    description:
      "Tips, strategies, and insights to help you build better Magic: The Gathering decks. Budget building, mana curve, commander guides, and more.",
    images: [SOCIAL_PREVIEW_TWITTER_IMAGE_URL],
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
