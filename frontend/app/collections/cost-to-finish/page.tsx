// frontend/app/collections/cost-to-finish/page.tsx
import type { Metadata } from "next";
import Client from "./Client";
import { RelatedTools } from "@/components/RelatedTools";

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

export default function Page() {
  return (
    <main className="w-full max-w-none px-4 sm:px-6 lg:px-8 2xl:px-10 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
      <section
        className="mb-6 max-w-4xl mx-auto text-neutral-200"
        aria-label="About Cost to Finish"
      >
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-4">
          Cost to Finish
        </h1>
        <p className="text-neutral-300 mb-4">
          Paste a decklist to estimate how much it costs to complete. The tool
          fetches current prices and shows a breakdown by card. Optionally
          subtract cards you already own by selecting a collection — your
          &quot;cost to finish&quot; counts only what you need to buy.
        </p>
        <h2 className="text-lg font-semibold text-neutral-100 mb-2">
          Prices and currency
        </h2>
        <p className="text-neutral-300 mb-4">
          Prices are based on TCGPlayer (USD) or Cardmarket (EUR/GBP). Choose
          your currency and see totals in real time. Swap suggestions help you
          stay within budget by offering cheaper alternatives for expensive
          cards.
        </p>
        <h2 className="text-lg font-semibold text-neutral-100 mb-2">
          Load from your deck
        </h2>
        <p className="text-neutral-300 mb-6">
          Sign in to load a deck from your ManaTap account. You can also paste
          any decklist in standard format (e.g. from Moxfield or Archidekt) and
          get instant cost estimates.
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
            { href: "/deck/swap-suggestions", label: "Budget Swaps" },
            { href: "/price-tracker", label: "Price Tracker" },
          ]}
        />
      </section>
      <Client />
    </main>
  );
}
