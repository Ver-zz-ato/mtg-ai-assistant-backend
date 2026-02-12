import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "MTG Budget Swap Tool | Cheaper Card Alternatives | ManaTap AI",
  description:
    "Free MTG budget swap tool. Find cheaper alternatives for expensive cards. Quick swaps and AI-powered suggestions that keep your deck strategy. ManaTap AI.",
  alternates: { canonical: "https://www.manatap.ai/mtg-budget-swap-tool" },
};

const FAQ = [
  {
    q: "How does the budget swap tool work?",
    a: "Set a budget threshold (e.g. $5 per card). The tool finds cards above that price and suggests alternatives. Compare before/after totals and export as CSV or apply swaps to a new deck.",
  },
  {
    q: "What is Quick Swaps vs AI-Powered Swaps?",
    a: "Quick Swaps uses a curated list of budget replacements for popular staples. AI-Powered Swaps (Pro) analyzes your deck's strategy to find cheaper cards that maintain synergies and theme.",
  },
  {
    q: "Can I use this with any decklist?",
    a: "Yes. Paste any decklist from Moxfield, Archidekt, or plain text. Or sign in to load decks from your ManaTap account.",
  },
  {
    q: "Does it fix card name typos?",
    a: "Yes. The tool can fix card names if your paste has typos before running swap suggestions.",
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
          MTG Budget Swap Tool
        </h1>
        <p className="text-neutral-300 mb-4 text-lg">
          The MTG budget swap tool helps you find cheaper alternatives for expensive cards in your
          deck. Paste your decklist or select a deck to get suggestions. Quick Swaps uses a curated
          list of budget replacements for popular staples. AI-Powered Swaps (Pro) analyzes your
          deck&apos;s strategy to find cheaper cards that maintain synergies and theme — not just
          direct replacements.
        </p>
        <h2 className="text-xl font-semibold text-neutral-100 mt-8 mb-3">
          How It Works
        </h2>
        <p className="text-neutral-300 mb-4">
          Set a budget threshold (e.g. $5 per card). The tool finds cards above that price and
          suggests alternatives. Compare before/after totals and export as CSV or apply swaps to a
          new deck. Fix card names if your paste has typos.
        </p>
        <h2 className="text-xl font-semibold text-neutral-100 mt-8 mb-3">
          Use With Your Deck
        </h2>
        <p className="text-neutral-300 mb-4">
          Sign in to load decks from your ManaTap account. Or paste any decklist — the tool works
          with standard formats from Moxfield, Archidekt, or plain text.
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
            href="/deck/swap-suggestions"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
          >
            Use Budget Swap Tool →
          </Link>
        </div>
      </article>
    </main>
  );
}
