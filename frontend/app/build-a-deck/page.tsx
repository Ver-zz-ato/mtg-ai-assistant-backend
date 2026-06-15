import type { Metadata } from "next";
import BuildADeckClient from "./BuildADeckClient";
import {
  SOCIAL_PREVIEW_OG_IMAGE,
  SOCIAL_PREVIEW_TWITTER_IMAGE_URL,
} from "@/lib/seo/metadata";

const title = "Build a Deck | MTG AI Deck Builder for Commander, Modern & Standard";
const description =
  "Build a Magic: The Gathering deck with a guided AI workflow. Choose Commander, Modern, Pioneer, Standard, or Pauper, set budget and power level, then generate a reviewable decklist.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "build a deck",
    "MTG deck builder",
    "Magic deck builder",
    "AI deck builder",
    "Commander deck builder",
    "MTG build a deck",
    "Standard deck builder",
  ],
  alternates: {
    canonical: "/build-a-deck",
  },
  openGraph: {
    title,
    description,
    url: "https://www.manatap.ai/build-a-deck",
    siteName: "ManaTap AI",
    images: [{ ...SOCIAL_PREVIEW_OG_IMAGE, alt: "ManaTap AI Build a Deck" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [SOCIAL_PREVIEW_TWITTER_IMAGE_URL],
  },
};

function jsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "ManaTap AI Build a Deck",
        description,
        url: "https://www.manatap.ai/build-a-deck",
        applicationCategory: "GameApplication",
        operatingSystem: "Web Browser",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        featureList: [
          "Guided MTG deck generation",
          "Commander deck builder",
          "Modern, Pioneer, Standard, and Pauper deck generation",
          "Budget and power level controls",
          "Reviewable decklist output",
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "Can ManaTap build a Commander deck?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes. Choose Commander, enter a commander or deck idea, set budget and power level, and ManaTap can generate a reviewable Commander decklist.",
            },
          },
          {
            "@type": "Question",
            name: "Can I build 60-card Magic decks?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Yes. The builder supports Modern, Pioneer, Standard, and Pauper with format-specific deck generation.",
            },
          },
          {
            "@type": "Question",
            name: "What should I do after generating a deck?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Review the list, copy it, save it to ManaTap, or run it through the MTG Deck Checker to inspect mana curve, land count, draw, ramp, interaction, and legality signals.",
            },
          },
        ],
      },
    ],
  });
}

export default function BuildADeckPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />
      <BuildADeckClient />
    </>
  );
}
