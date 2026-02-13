import type { Metadata } from "next";
import Link from "next/link";
import { RelatedTools } from "@/components/RelatedTools";
import { ToolStrip } from "@/components/ToolStrip";
import { PopularCommanders } from "@/components/PopularCommanders";

export const metadata: Metadata = {
  title: "Budget Swaps • ManaTap AI",
  description: "Paste a decklist and see cheaper, similar alternatives for expensive cards.",
  alternates: { canonical: "https://www.manatap.ai/deck/swap-suggestions" },
};

const FAQ = [
  { q: "What is the budget threshold?", a: "Set a price (e.g. $5 per card). The tool finds cards above that price and suggests cheaper alternatives." },
  { q: "Quick Swaps vs AI-Powered Swaps?", a: "Quick Swaps uses a curated list of budget replacements for popular staples. AI-Powered (Pro) analyzes your deck's strategy to find cheaper cards that maintain synergies." },
  { q: "Can I paste from Moxfield or Archidekt?", a: "Yes. The tool works with standard formats from Moxfield, Archidekt, or plain text. Fix card names if your paste has typos." },
  { q: "How do I apply swaps to a new deck?", a: "Compare before/after totals, export as CSV, or apply swaps to create a new deck. Sign in to load decks from your ManaTap account." },
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
    aria-label="About Budget Swaps"
  >
    <h1 className="text-xl md:text-2xl font-bold text-white mb-3">
      Budget Swaps
    </h1>
    <p className="text-neutral-300 mb-3 text-sm">
      Paste your decklist or select a deck to get cheaper alternatives for
      expensive cards. Quick Swaps uses a curated list of budget replacements
      for popular staples. AI-Powered Swaps (Pro) analyzes your deck&apos;s strategy
      to find cheaper cards that maintain synergies and theme — not just direct
      replacements.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">
      How it works
    </h2>
    <p className="text-neutral-300 mb-3 text-sm">
      Set a budget threshold (e.g. $5 per card). The tool finds cards above
      that price and suggests alternatives. Compare before/after totals and
      export as CSV or apply swaps to a new deck. Fix card names if your paste
      has typos.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">
      Use with your deck
    </h2>
    <p className="text-neutral-300 mb-4 text-sm">
      Sign in to load decks from your ManaTap account. Or paste any decklist —
      the tool works with standard formats from Moxfield, Archidekt, or plain
      text.
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
        { href: "/tools/probability", label: "MTG Probability Calculator" },
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

export default function SwapSuggestionsLayout({
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
              <ToolStrip currentPath="/deck/swap-suggestions" variant="compact" className="mb-4" />
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
