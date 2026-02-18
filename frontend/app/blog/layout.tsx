import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MTG Deck Building Blog | ManaTap AI",
  description:
    "Tips, strategies, and insights to help you build better Magic: The Gathering decks. Budget building, mana curve, commander guides, and more.",
  alternates: { canonical: "https://www.manatap.ai/blog" },
  openGraph: {
    url: "https://www.manatap.ai/blog",
    siteName: "ManaTap AI",
    type: "website",
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
