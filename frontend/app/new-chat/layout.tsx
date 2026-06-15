import type { Metadata } from "next";
import Link from "next/link";
import { RelatedTools } from "@/components/RelatedTools";
import { ToolStrip } from "@/components/ToolStrip";
import { PopularCommanders } from "@/components/PopularCommanders";

export const metadata: Metadata = {
  title: "AI Chat Preview | ManaTap AI",
  description:
    "Ask Magic: The Gathering rules questions, get deck advice, and explore card interactions with ManaTap AI.",
  robots: { index: false, follow: false },
};

const FAQ = [
  {
    q: "What can I ask ManaTap AI?",
    a: "Rules questions, deckbuilding advice, card interactions, upgrade ideas, and quick strategy help for Commander and other constructed formats.",
  },
  {
    q: "Do I need to sign in?",
    a: "Guests can try example conversations. Sign in for saved threads, higher daily limits, and deck-linked chat.",
  },
  {
    q: "Can I attach a deck to the chat?",
    a: "Yes. Load or link a deck from your account so answers stay grounded in your actual list and commander.",
  },
  {
    q: "How is this different from AI Workshop?",
    a: "AI Chat is open-ended Q&A. AI Workshop runs structured refinement passes on a full decklist with review before applying changes.",
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
    aria-label="About ManaTap AI Chat"
  >
    <h2 className="text-xl md:text-2xl font-bold text-white mb-3">ManaTap AI Chat</h2>
    <p className="text-neutral-300 mb-3 text-sm">
      Your tactical MTG co-pilot for rules, deck tuning, and card questions. Paste a list, link a
      deck, or ask anything about your game plan — ManaTap answers with format-aware context.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">How it works</h2>
    <p className="text-neutral-300 mb-3 text-sm">
      Start typing in the chat panel. Guests can explore with limits; signed-in users get saved
      threads, deck linking, and more daily messages. Use the left panel for threads, shoutbox, and
      meta snapshots.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">Use with your deck</h2>
    <p className="text-neutral-300 mb-4 text-sm">
      Link a saved deck or paste a list so recommendations respect your commander, colors, and
      card choices instead of generic advice.
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
        { href: "/ai-workshop", label: "AI Workshop" },
        { href: "/mtg-deck-checker", label: "Deck Checker" },
        { href: "/build-a-deck", label: "Build a Deck" },
        { href: "/deck/swap-suggestions", label: "Budget Swaps" },
        { href: "/tools/mulligan", label: "Mulligan Simulator" },
      ]}
    />
    <p className="text-sm text-neutral-400 mt-4">
      Explore:{" "}
      <Link href="/commanders" className="text-cyan-400 hover:underline">
        Commanders
      </Link>
      {" · "}
      <Link href="/tools" className="text-cyan-400 hover:underline">
        All tools
      </Link>
      {" · "}
      <Link href="/new-home" className="text-cyan-400 hover:underline">
        New homepage preview
      </Link>
    </p>
    <PopularCommanders />
  </section>
);

export default function NewChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd() }} />
      <div className="w-full max-w-none px-4 sm:px-6 lg:px-8 2xl:px-10 py-6">
        <div className="max-w-[1600px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            <div className="lg:col-span-8 order-2 lg:order-1 min-w-0">
              <ToolStrip currentPath="/new-chat" variant="compact" className="mb-4" />
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
