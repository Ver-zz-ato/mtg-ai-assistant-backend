import type { Metadata } from "next";
import { RelatedTools } from "@/components/RelatedTools";
import { ToolStrip } from "@/components/ToolStrip";
import { PopularCommanders } from "@/components/PopularCommanders";

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

const IntroBlock = () => (
  <section
    className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-5 text-neutral-200"
    aria-label="About the Mulligan Simulator"
  >
    <h1 className="text-xl md:text-2xl font-bold text-white mb-3">
      Commander Mulligan Simulator
    </h1>
    <p className="text-neutral-300 mb-3 text-sm">
      Simulate thousands of opening hands to see how often you&apos;ll keep or
      mulligan with Commander rules. The London mulligan lets you draw back
      up to seven after putting cards on the bottom — and in Commander, your
      first mulligan is free.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">How it works</h2>
    <p className="text-neutral-300 mb-3 text-sm">
      Set your deck size (typically 99 for Commander), how many &quot;success&quot;
      cards you need (e.g. lands, ramp, or combo pieces), and your land
      count. The simulator runs thousands of iterations to estimate keep
      rates for 7, 6, and 5 cards.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">Use with your deck</h2>
    <p className="text-neutral-300 mb-4 text-sm">
      Load a deck from your ManaTap account to auto-fill land count and
      success cards. Or paste a decklist to analyze any build before you
      sleeve it up.
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
        { href: "/tools/probability", label: "MTG Probability Calculator" },
        { href: "/collections/cost-to-finish", label: "Cost to Finish" },
        { href: "/deck/swap-suggestions", label: "Budget Swaps" },
      ]}
    />
    <PopularCommanders />
  </section>
);

export default function MulliganLayout({
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
              <ToolStrip currentPath="/tools/mulligan" variant="compact" className="mb-4" />
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
