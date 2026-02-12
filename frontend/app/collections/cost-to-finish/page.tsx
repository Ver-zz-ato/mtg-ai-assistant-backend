// frontend/app/collections/cost-to-finish/page.tsx
import type { Metadata } from "next";
import Client from "./Client";
import { RelatedTools } from "@/components/RelatedTools";
import { ToolStrip } from "@/components/ToolStrip";
import { PopularCommanders } from "@/components/PopularCommanders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cost to Finish • ManaTap AI",
  description:
    "Paste a decklist and estimate the cost to finish. Optionally subtract owned from a selected collection.",
  openGraph: {
    title: "Cost to Finish • ManaTap AI",
    description:
      "Estimate the cost to finish a deck. Subtract owned from your collection.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cost to Finish • ManaTap AI",
    description:
      "Estimate the cost to finish a deck. Subtract owned from your collection.",
  },
  alternates: { canonical: "https://www.manatap.ai/collections/cost-to-finish" },
};

const FAQ = [
  { q: "What does 'cost to finish' mean?", a: "The total price of cards you still need to buy to complete the deck, after subtracting what you already own from a selected collection." },
  { q: "Which price sources are used?", a: "TCGPlayer for USD, Cardmarket for EUR and GBP. Prices update regularly from Scryfall." },
  { q: "Can I use this for decks I don't own?", a: "Yes. Paste any decklist from Moxfield, Archidekt, or plain text. The tool works without an account for basic estimates." },
  { q: "How do swap suggestions work?", a: "Pro users get AI-powered cheaper alternatives that maintain deck strategy. Free users see quick swaps from a curated list." },
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
    aria-label="About Cost to Finish"
  >
    <h1 className="text-xl md:text-2xl font-bold text-white mb-3">
      Cost to Finish
    </h1>
    <p className="text-neutral-300 mb-3 text-sm">
      Paste a decklist to estimate how much it costs to complete. The tool
      fetches current prices and shows a breakdown by card. Optionally
      subtract cards you already own by selecting a collection — your
      &quot;cost to finish&quot; counts only what you need to buy.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">Prices and currency</h2>
    <p className="text-neutral-300 mb-3 text-sm">
      Prices are based on TCGPlayer (USD) or Cardmarket (EUR/GBP). Choose
      your currency and see totals in real time. Swap suggestions help you
      stay within budget.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">Load from your deck</h2>
    <p className="text-neutral-300 mb-4 text-sm">
      Sign in to load a deck from your ManaTap account. You can also paste
      any decklist in standard format (e.g. from Moxfield or Archidekt).
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
        { href: "/deck/swap-suggestions", label: "Budget Swaps" },
        { href: "/price-tracker", label: "Price Tracker" },
      ]}
    />
    <PopularCommanders />
  </section>
);

export default function Page() {
  return (
    <main className="w-full max-w-none px-4 sm:px-6 lg:px-8 2xl:px-10 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
      <div className="max-w-[1800px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          <div className="lg:col-span-8 order-2 lg:order-1 min-w-0">
            <ToolStrip currentPath="/collections/cost-to-finish" variant="compact" className="mb-4" />
            <Client />
          </div>
          <aside className="lg:col-span-4 order-1 lg:order-2 lg:sticky lg:top-4 self-start">
            <IntroBlock />
          </aside>
        </div>
      </div>
    </main>
  );
}
