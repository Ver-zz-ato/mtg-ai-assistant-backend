import type { Metadata } from "next";
import Link from "next/link";
import { RelatedTools } from "@/components/RelatedTools";
import { ToolStrip } from "@/components/ToolStrip";
import { PopularCommanders } from "@/components/PopularCommanders";
import { TOOL_DESCRIPTIONS } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "AI Workshop • ManaTap AI",
  description: TOOL_DESCRIPTIONS.aiWorkshop,
  alternates: { canonical: "https://www.manatap.ai/ai-workshop" },
};

const FAQ = [
  {
    q: "What is AI Workshop?",
    a: "AI Workshop runs focused refinement passes on an existing decklist — mana base, curve, interaction, budget, power level, or legality — with a review step before you apply changes.",
  },
  {
    q: "Do I need to sign in?",
    a: "Yes. Sign in to run AI refinement passes. You can paste a list and explore settings as a guest, but Run requires an account.",
  },
  {
    q: "How is this different from Budget Swaps?",
    a: "Budget Swaps finds cheaper 1-for-1 replacements. AI Workshop covers broader passes (curve, interaction, power, legality) and uses the transform engine for most passes.",
  },
  {
    q: "What formats are supported?",
    a: "Commander, Modern, Pioneer, Standard, and Pauper. Constructed lists keep sideboard sections when you apply changes.",
  },
  {
    q: "How many free passes do I get?",
    a: "Free accounts get 5 AI Workshop refinements per day. Pro gets unlimited passes and access to bigger rebuild options.",
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

const IntroBlock = () => (
  <section
    className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-5 text-neutral-200"
    aria-label="About AI Workshop"
  >
    <h2 className="text-xl md:text-2xl font-bold text-white mb-3">AI Workshop</h2>
    <p className="text-neutral-300 mb-3 text-sm">
      Load a decklist and run targeted AI passes: general cleanup, mana base, curve, interaction,
      lower budget, raise power, make more casual, or fix legality. Review adds and cuts before
      applying, then save a refined deck to your account.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">How it works</h2>
    <p className="text-neutral-300 mb-3 text-sm">
      Paste a list or pick a saved deck, choose a pass, tune power/budget and constraints, then
      run. Most passes use the deck transform engine; the budget pass uses validated cheaper swaps.
      Sign in to run — free users get 5 passes per day.
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
        { href: "/compare-decks", label: "Deck Compare" },
        { href: "/mtg-deck-checker", label: "Deck Checker" },
        { href: "/collections/cost-to-finish", label: "Cost to Finish" },
      ]}
    />
    <p className="text-sm text-neutral-400 mt-4">
      Explore:{" "}
      <Link href="/commander-archetypes" className="text-cyan-400 hover:underline">
        Archetypes
      </Link>
      {" · "}
      <Link href="/tools" className="text-cyan-400 hover:underline">
        All tools
      </Link>
    </p>
    <PopularCommanders />
  </section>
);

export default function AiWorkshopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
      <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 2xl:px-10 py-6">
        <div className="max-w-[1600px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            <div className="lg:col-span-8 order-2 lg:order-1 min-w-0">
              <ToolStrip currentPath="/ai-workshop" variant="compact" className="mb-4" />
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
