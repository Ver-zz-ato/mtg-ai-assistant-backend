import type { Metadata } from "next";
import { RelatedTools } from "@/components/RelatedTools";
import { ToolStrip } from "@/components/ToolStrip";
import { PopularCommanders } from "@/components/PopularCommanders";

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

const IntroBlock = () => (
  <section
    className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-5 text-neutral-200"
    aria-label="About the Price Tracker"
  >
    <h1 className="text-xl md:text-2xl font-bold text-white mb-3">
      MTG Price Tracker
    </h1>
    <p className="text-neutral-300 mb-3 text-sm">
      Track Magic: The Gathering card prices over time. Enter card names or
      load a deck to see historical price data in USD, EUR, or GBP. Spot
      trends, compare reprints, and plan purchases when prices dip.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">Price history and trends</h2>
    <p className="text-neutral-300 mb-3 text-sm">
      View price charts for the last 30, 90, or 365 days. Optional
      moving-average overlays smooth volatility.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">Deck value over time</h2>
    <p className="text-neutral-300 mb-4 text-sm">
      Connected users can load a deck to see its total value trend. Sign in
      to unlock full features.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">FAQ</h2>
    <dl className="space-y-2 text-neutral-300 text-sm">
      {FAQ.map(({ q, a }) => (
        <div key={q}>
          <dt className="font-medium text-neutral-100">{q}</dt>
          <dd className="ml-0 mt-0.5">{a}</dd>
        </div>
      ))}
    </dl>
    <RelatedTools
      tools={[
        { href: "/collections/cost-to-finish", label: "Cost to Finish" },
        { href: "/deck/swap-suggestions", label: "Budget Swaps" },
      ]}
    />
    <PopularCommanders />
  </section>
);

export default function PriceTrackerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
      <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 2xl:px-10 py-6">
        <div className="max-w-[1600px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            <div className="lg:col-span-8 order-2 lg:order-1 min-w-0">
              <ToolStrip currentPath="/price-tracker" variant="compact" className="mb-4" />
              {children}
            </div>
            <aside className="lg:col-span-4 order-1 lg:order-2 lg:sticky lg:top-4 self-start">
              <IntroBlock />
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
