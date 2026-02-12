import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "MTG Deck Cost Calculator | Cost to Finish Your Deck | ManaTap AI",
  description:
    "Free MTG deck cost calculator. Estimate cost to finish a deck. Subtract owned cards from your collection. TCGPlayer and Cardmarket prices. ManaTap AI.",
  alternates: { canonical: "https://www.manatap.ai/mtg-deck-cost-calculator" },
};

const FAQ = [
  {
    q: "What does 'cost to finish' mean?",
    a: "The total price of cards you still need to buy to complete the deck, after subtracting what you already own from a selected collection.",
  },
  {
    q: "Which price sources are used?",
    a: "TCGPlayer for USD, Cardmarket for EUR and GBP. Prices update regularly from Scryfall.",
  },
  {
    q: "Can I use this for decks I don't own?",
    a: "Yes. Paste any decklist from Moxfield, Archidekt, or plain text. The tool works without an account for basic estimates.",
  },
  {
    q: "How do swap suggestions work?",
    a: "Pro users get AI-powered cheaper alternatives that maintain deck strategy. Free users see quick swaps from a curated list.",
  },
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
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
      <article className="text-neutral-200">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
          MTG Deck Cost Calculator
        </h1>
        <p className="text-neutral-300 mb-4 text-lg">
          The MTG deck cost calculator helps you estimate how much it costs to finish a deck.
          Paste a decklist and get current prices for every card. Optionally subtract cards you
          already own by selecting a collection — your &quot;cost to finish&quot; counts only what you
          need to buy.
        </p>
        <h2 className="text-xl font-semibold text-neutral-100 mt-8 mb-3">
          Prices and Currency
        </h2>
        <p className="text-neutral-300 mb-4">
          Prices are based on TCGPlayer (USD) or Cardmarket (EUR/GBP). Choose your currency and see
          totals in real time. Swap suggestions help you stay within budget by offering cheaper
          alternatives for expensive cards.
        </p>
        <h2 className="text-xl font-semibold text-neutral-100 mt-8 mb-3">
          Load From Your Deck
        </h2>
        <p className="text-neutral-300 mb-4">
          Sign in to load a deck from your ManaTap account. You can also paste any decklist in
          standard format (e.g. from Moxfield or Archidekt) and get instant cost estimates. No
          account required for basic use.
        </p>
        <h2 className="text-xl font-semibold text-neutral-100 mt-8 mb-3">
          FAQ
        </h2>
        <dl className="space-y-3 text-neutral-300">
          {FAQ.map(({ q, a }) => (
            <div key={q}>
              <dt className="font-medium text-neutral-100">{q}</dt>
              <dd className="ml-0 mt-1 text-sm">{a}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-10">
          <Link
            href="/collections/cost-to-finish"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
          >
            Use Cost to Finish Calculator →
          </Link>
        </div>
      </article>
    </main>
  );
}
