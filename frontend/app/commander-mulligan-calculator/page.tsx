import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Commander Mulligan Calculator | Free MTG Keep Rate Simulator | ManaTap AI",
  description:
    "Free Commander mulligan calculator. Simulate London mulligan keep rates for your EDH deck. Calculate odds of lands, ramp, and key cards in your opener. ManaTap AI.",
  alternates: { canonical: "https://www.manatap.ai/commander-mulligan-calculator" },
};

const FAQ = [
  {
    q: "What is the London mulligan in Commander?",
    a: "The London mulligan lets you put any number of cards from your hand on the bottom of your library, then draw back up to seven. In Commander, your first mulligan is free.",
  },
  {
    q: "How many iterations does the simulator run?",
    a: "Free users get 2,000 simulations; Pro users can run up to 20,000 for more stable results.",
  },
  {
    q: "What counts as a 'success' card?",
    a: "You define success cards as anything you need in your opener — lands, ramp, tutors, or combo pieces.",
  },
  {
    q: "Does the calculator support play vs draw?",
    a: "Yes. Toggle play/draw to model being on the draw (you draw one extra card before the game starts).",
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
          Commander Mulligan Calculator
        </h1>
        <p className="text-neutral-300 mb-4 text-lg">
          The Commander mulligan calculator helps you understand how often you&apos;ll keep or ship
          your opening hand in EDH. With London mulligan rules and a free first mulligan, your
          opener matters more than ever. This tool simulates thousands of draws to estimate keep
          rates for 7, 6, and 5 cards — so you can see how reliably you hit lands, ramp, or combo
          pieces.
        </p>
        <h2 className="text-xl font-semibold text-neutral-100 mt-8 mb-3">
          How the Mulligan Simulator Works
        </h2>
        <p className="text-neutral-300 mb-4">
          Set your deck size (typically 100 for Commander), land count, and how many &quot;success&quot;
          cards you need (e.g. two lands plus a ramp spell). The simulator runs thousands of
          iterations to estimate the probability of keeping hands of 7, 6, or 5 cards. You can
          require minimum or maximum lands, add color requirements for mana fixing, and toggle
          play vs draw to model being on the draw.
        </p>
        <h2 className="text-xl font-semibold text-neutral-100 mt-8 mb-3">
          Use With Your Deck
        </h2>
        <p className="text-neutral-300 mb-4">
          Load a deck from your ManaTap account to auto-fill land count and success cards. Or paste
          any decklist from Moxfield, Archidekt, or plain text to analyze mulligan odds before you
          sleeve it up. The tool works without an account for basic simulations.
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
            href="/tools/mulligan"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
          >
            Use Mulligan Calculator →
          </Link>
        </div>
      </article>
    </main>
  );
}
