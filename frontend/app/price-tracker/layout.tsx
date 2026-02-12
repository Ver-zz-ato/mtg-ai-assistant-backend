import type { Metadata } from "next";
import { RelatedTools } from "@/components/RelatedTools";

export const metadata: Metadata = {
  title: "MTG Price Tracker | Card Price History | ManaTap AI",
  description:
    "Track Magic: The Gathering card prices over time. View price history, trends, and alerts for your deck and collection.",
  alternates: { canonical: "https://www.manatap.ai/price-tracker" },
};

const FAQ = [
  { q: "Where do ManaTap prices come from?", a: "Prices are sourced from TCGPlayer (USD) and Cardmarket (EUR/GBP) via Scryfall's API." },
  { q: "How far back does price history go?", a: "Charts support 30, 90, or 365 days. Sign in to load a deck and see its total value over time." },
  { q: "What are moving averages?", a: "7-day and 30-day moving averages smooth short-term noise to show underlying trends." },
  { q: "Can I track multiple cards at once?", a: "Yes. Enter multiple card names or load a deck to see comparative price charts." },
];

function faqJsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  });
}

export default function PriceTrackerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
      <section
        className="mb-6 max-w-4xl mx-auto px-4 text-neutral-200"
        aria-label="About the Price Tracker"
      >
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-4">
          MTG Price Tracker
        </h1>
        <p className="text-neutral-300 mb-4">
          Track Magic: The Gathering card prices over time. Enter card names or
          load a deck to see historical price data in USD, EUR, or GBP. Spot
          trends, compare reprints, and plan purchases when prices dip.
        </p>
        <h2 className="text-lg font-semibold text-neutral-100 mb-2">
          Price history and trends
        </h2>
        <p className="text-neutral-300 mb-4">
          View price charts for the last 30, 90, or 365 days. Optional
          moving-average overlays smooth volatility. Use the watchlist to track
          cards you&apos;re considering for your deck or collection.
        </p>
        <h2 className="text-lg font-semibold text-neutral-100 mb-2">
          Deck value over time
        </h2>
        <p className="text-neutral-300 mb-6">
          Connected users can load a deck to see its total value trend. Compare
          before and after reprints or track your collection&apos;s growth. Sign in
          to unlock full features.
        </p>
        <h2 className="text-lg font-semibold text-neutral-100 mb-2">FAQ</h2>
        <dl className="space-y-3 text-neutral-300">
          {FAQ.map(({ q, a }) => (
            <div key={q}>
              <dt className="font-medium text-neutral-100">{q}</dt>
              <dd className="ml-0 mt-1 text-sm">{a}</dd>
            </div>
          ))}
        </dl>
        <RelatedTools
          tools={[
            { href: "/collections/cost-to-finish", label: "Cost to Finish" },
            { href: "/deck/swap-suggestions", label: "Budget Swaps" },
          ]}
        />
      </section>
      {children}
    </>
  );
}
