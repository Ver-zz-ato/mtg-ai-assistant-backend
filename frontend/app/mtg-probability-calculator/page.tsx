import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "MTG Probability Calculator | Commander Draw Odds | ManaTap AI",
  description:
    "Free MTG probability calculator. Hypergeometric odds for Commander and EDH. Calculate draw probability for lands, Sol Ring, combo pieces. ManaTap AI.",
  alternates: { canonical: "https://www.manatap.ai/mtg-probability-calculator" },
};

const FAQ = [
  {
    q: "What is hypergeometric probability in MTG?",
    a: "Drawing without replacement: each card drawn changes the deck. The formula gives the chance of drawing at least N of your target cards by a given turn.",
  },
  {
    q: "Why does play vs draw matter?",
    a: "On the draw you get one extra card before the game starts, which improves your odds of hitting key cards.",
  },
  {
    q: "Can I model specific cards like Sol Ring?",
    a: "Yes. Set 'hits in deck' to the number of copies (e.g. 1 for Sol Ring) and see the probability of drawing it by turn N.",
  },
  {
    q: "What is the color requirement solver?",
    a: "Advanced mode lets you specify color sources (e.g. 10 white, 10 blue) and requirements (e.g. need WW by turn 3) to see the probability of having correct mana.",
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
          MTG Probability Calculator
        </h1>
        <p className="text-neutral-300 mb-4 text-lg">
          The MTG probability calculator answers questions like &quot;What are the odds I draw at
          least one Sol Ring by turn 2?&quot; or &quot;How many copies of my combo piece do I need to see
          it in 4 turns?&quot; Magic uses drawing without replacement, so the standard
          hypergeometric formula accounts for your deck shrinking as you draw.
        </p>
        <h2 className="text-xl font-semibold text-neutral-100 mt-8 mb-3">
          Opening Hand and Draw Odds
        </h2>
        <p className="text-neutral-300 mb-4">
          Set deck size (100 for Commander), number of &quot;hits&quot; in the deck (e.g. lands or a
          specific card), hand size, and turns. The calculator shows the probability of drawing
          at least N of your target cards by the given turn. Play or draw affects your card count
          — toggle for accuracy.
        </p>
        <h2 className="text-xl font-semibold text-neutral-100 mt-8 mb-3">
          Color Requirements and Ramp
        </h2>
        <p className="text-neutral-300 mb-4">
          Advanced mode lets you configure color sources and requirements (e.g. &quot;need UU by
          turn 3&quot;) or model ramp and removal density. Load a deck from ManaTap to auto-fill values,
          or enter them manually for any decklist.
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
            href="/tools/probability"
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
          >
            Use Probability Calculator →
          </Link>
        </div>
      </article>
    </main>
  );
}
