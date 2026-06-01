import type { Metadata } from "next";
import DeckCheckerClient from "./DeckCheckerClient";

const title = "MTG Deck Checker | Free Magic Deck Analyzer & Deck Rater";
const description =
  "Paste any Magic: The Gathering decklist and check legality, mana curve, lands, ramp, draw, removal, and upgrade suggestions. Free MTG deck checker for Commander, Modern, Standard, Pioneer, and Pauper.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "MTG deck checker",
    "MTG deck analyzer",
    "Magic deck checker",
    "deck checker MTG",
    "MTG deck rater",
    "EDH deck analyzer",
    "Commander deck checker",
  ],
  alternates: {
    canonical: "/mtg-deck-checker",
  },
  openGraph: {
    title,
    description,
    url: "https://www.manatap.ai/mtg-deck-checker",
    siteName: "ManaTap AI",
    images: [
      {
        url: "/opengraph-image.jpg",
        width: 1200,
        height: 630,
        alt: "ManaTap AI MTG Deck Checker",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/twitter-image.jpg"],
  },
};

function jsonLd() {
  return JSON.stringify([
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "ManaTap AI MTG Deck Checker",
      description,
      url: "https://www.manatap.ai/mtg-deck-checker",
      applicationCategory: "GameApplication",
      operatingSystem: "Web Browser",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      featureList: [
        "MTG decklist analysis",
        "Commander and constructed format checks",
        "Mana curve review",
        "Land, ramp, draw, and removal counts",
        "Upgrade suggestions",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What does the MTG deck checker look for?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "It checks deck structure, format-aware card roles, mana curve, land count, ramp, card draw, interaction, and upgrade opportunities.",
          },
        },
        {
          "@type": "Question",
          name: "Does it work for Commander decks?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. The checker supports Commander along with Modern, Pioneer, Standard, and Pauper analysis.",
          },
        },
        {
          "@type": "Question",
          name: "Do I need an account to check a deck?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. You can paste a decklist and run a free check from the landing page.",
          },
        },
      ],
    },
  ]);
}

export default function MTGDeckCheckerPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />
      <DeckCheckerClient />
    </>
  );
}
