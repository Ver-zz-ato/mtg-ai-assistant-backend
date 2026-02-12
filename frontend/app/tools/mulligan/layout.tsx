import type { Metadata } from "next";
import { RelatedTools } from "@/components/RelatedTools";

export const metadata: Metadata = {
  title: "Commander Mulligan Simulator | MTG Keep Rate Calculator | ManaTap AI",
  description:
    "Simulate Commander mulligans with London rules. Calculate keep rates for lands, ramp, and key cards. Free MTG mulligan calculator for EDH.",
  alternates: { canonical: "https://www.manatap.ai/tools/mulligan" },
};

const FAQ = [
  { q: "What is the London mulligan in Commander?", a: "The London mulligan lets you put any number of cards from your hand on the bottom of your library, then draw back up to seven. In Commander, your first mulligan is free." },
  { q: "How many iterations does the simulator run?", a: "Free users get 2,000 simulations; Pro users can run up to 20,000 for more stable results." },
  { q: "What counts as a 'success' card?", a: "You define success cards as anything you need in your opener — lands, ramp, tutors, or combo pieces." },
  { q: "Does the calculator support play vs draw?", a: "Yes. Toggle play/draw to model being on the draw (you draw one extra card before the game starts)." },
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

export default function MulliganLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
      <section
        className="mb-6 max-w-4xl mx-auto px-4 text-neutral-200"
        aria-label="About the Mulligan Simulator"
      >
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-4">
          Commander Mulligan Simulator
        </h1>
        <p className="text-neutral-300 mb-4">
          Simulate thousands of opening hands to see how often you&apos;ll keep or
          mulligan with Commander rules. The London mulligan lets you draw back
          up to seven after putting cards on the bottom — and in Commander, your
          first mulligan is free.
        </p>
        <h2 className="text-lg font-semibold text-neutral-100 mb-2">
          How it works
        </h2>
        <p className="text-neutral-300 mb-4">
          Set your deck size (typically 99 for Commander), how many &quot;success&quot;
          cards you need (e.g. lands, ramp, or combo pieces), and your land
          count. The simulator runs thousands of iterations to estimate keep
          rates for 7, 6, and 5 cards. You can optionally require minimum or
          maximum lands, or add color requirements for mana fixing.
        </p>
        <h2 className="text-lg font-semibold text-neutral-100 mb-2">
          Use with your deck
        </h2>
        <p className="text-neutral-300 mb-6">
          Load a deck from your ManaTap account to auto-fill land count and
          success cards. Or paste a decklist to analyze any build before you
          sleeve it up.
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
            { href: "/tools/probability", label: "MTG Probability Calculator" },
            { href: "/collections/cost-to-finish", label: "Cost to Finish" },
            { href: "/deck/swap-suggestions", label: "Budget Swaps" },
          ]}
        />
      </section>
      {children}
    </>
  );
}
