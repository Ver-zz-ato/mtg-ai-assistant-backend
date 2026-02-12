import type { Metadata } from "next";
import Link from "next/link";
import { RelatedTools } from "@/components/RelatedTools";
import { ToolStrip } from "@/components/ToolStrip";
import { PopularCommanders } from "@/components/PopularCommanders";

export const metadata: Metadata = {
  title: "MTG Probability Calculator | Commander Draw Odds | ManaTap AI",
  description:
    "Calculate probability of drawing lands, ramp, or combo pieces in Magic: The Gathering. Free hypergeometric calculator for Commander and EDH.",
  alternates: { canonical: "https://www.manatap.ai/tools/probability" },
};

const FAQ = [
  { q: "What is hypergeometric probability in MTG?", a: "Drawing without replacement: each card drawn changes the deck. The formula gives the chance of drawing at least N of your target cards by a given turn." },
  { q: "Why does play vs draw matter?", a: "On the draw you get one extra card before the game starts, which improves your odds of hitting key cards." },
  { q: "Can I model specific cards like Sol Ring?", a: "Yes. Set 'hits in deck' to the number of copies (e.g. 1 for Sol Ring) and see the probability of drawing it by turn N." },
  { q: "What is the color requirement solver?", a: "Advanced mode lets you specify color sources (e.g. 10 white, 10 blue) and requirements (e.g. need WW by turn 3) to see the probability of having correct mana." },
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
    aria-label="About the Probability Calculator"
  >
    <h1 className="text-xl md:text-2xl font-bold text-white mb-3">
      MTG Probability Calculator
    </h1>
    <p className="text-neutral-300 mb-3 text-sm">
      Use hypergeometric probability to answer questions like &quot;What are the
      odds I draw at least one Sol Ring by turn 2?&quot; or &quot;How many copies of
      my combo piece do I need to see it in 4 turns?&quot; Magic uses
      drawing without replacement, so the standard formula accounts for
      your deck shrinking as you draw.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">Opening hand and draw odds</h2>
    <p className="text-neutral-300 mb-3 text-sm">
      Set deck size (99 for Commander), number of &quot;hits&quot; in the deck
      (e.g. lands or a specific card), hand size, and turns.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">Color requirements and ramp</h2>
    <p className="text-neutral-300 mb-4 text-sm">
      Advanced mode lets you configure color sources and requirements (e.g.
      &quot;need UU by turn 3&quot;) or model ramp and removal density.
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
        { href: "/tools/mulligan", label: "Commander Mulligan Simulator" },
        { href: "/collections/cost-to-finish", label: "Cost to Finish" },
      ]}
    />
    <p className="text-sm text-neutral-400 mt-4">
      Explore:{" "}
      <Link href="/commander-archetypes" className="text-cyan-400 hover:underline">Archetypes</Link>
      {" · "}
      <Link href="/strategies" className="text-cyan-400 hover:underline">Strategies</Link>
      {" · "}
      <Link href="/meta" className="text-cyan-400 hover:underline">Meta</Link>
    </p>
    <PopularCommanders />
  </section>
);

export default function ProbabilityLayout({
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
              <ToolStrip currentPath="/tools/probability" variant="compact" className="mb-4" />
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
