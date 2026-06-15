import type { Metadata } from "next";
import Link from "next/link";
import { RelatedTools } from "@/components/RelatedTools";
import { ToolStrip } from "@/components/ToolStrip";
import { PopularCommanders } from "@/components/PopularCommanders";
import { PILL_BASE_CLASS, pillClassAt } from "@/lib/ui/accentPills";

export const metadata: Metadata = {
  title: "AI Chat Preview | ManaTap AI",
  description:
    "Ask Magic: The Gathering rules questions, get deck advice, and explore card interactions with ManaTap AI.",
  robots: { index: false, follow: false },
};

const FAQ_QUESTION_COLORS = [
  "text-violet-300",
  "text-cyan-300",
  "text-emerald-300",
  "text-amber-300",
] as const;

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

const EXPLORE_LINKS = [
  { href: "/commanders", label: "Commanders" },
  { href: "/tools", label: "All tools" },
  { href: "/meta", label: "Meta hub" },
  { href: "/new-home", label: "Homepage preview" },
] as const;

const IntroBlock = () => (
  <section
    className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-5 pb-4 text-neutral-200"
    aria-label="About ManaTap AI Chat"
  >
    <h2 className="text-xl md:text-2xl font-bold text-white mb-3">ManaTap AI Chat</h2>
    <p className="text-neutral-300 mb-3 text-sm">
      Your tactical MTG co-pilot for rules, deck tuning, and card questions. Paste a list, link a
      deck, or ask anything about your game plan — ManaTap answers with format-aware context.
    </p>
    <h2 className="text-base font-semibold text-cyan-300 mb-2">How it works</h2>
    <p className="text-neutral-300 mb-3 text-sm">
      Start typing in the chat panel. Guests can explore with limits; signed-in users get saved
      threads, deck linking, and more daily messages.
    </p>
    <h2 className="text-base font-semibold text-emerald-300 mb-2">Use with your deck</h2>
    <p className="text-neutral-300 mb-4 text-sm">
      Link a saved deck or paste a list so recommendations respect your commander, colors, and
      card choices instead of generic advice.
    </p>
    <h2 className="text-base font-semibold text-neutral-100 mb-2">FAQ</h2>
    <dl className="space-y-3 text-neutral-300 text-sm">
      {FAQ.map(({ q, a }, i) => (
        <div key={q}>
          <dt className={`font-semibold ${FAQ_QUESTION_COLORS[i % FAQ_QUESTION_COLORS.length]}`}>
            {q}
          </dt>
          <dd className="ml-0 mt-0.5 text-neutral-400">{a}</dd>
        </div>
      ))}
    </dl>
    <RelatedTools
      variant="pill"
      tools={[
        {
          href: "/ai-workshop",
          label: "AI Workshop",
          pillClass:
            "border-violet-300/35 bg-violet-500/12 text-violet-100 hover:border-violet-300/55 hover:bg-violet-500/18",
        },
        {
          href: "/mtg-deck-checker",
          label: "Deck Checker",
          pillClass:
            "border-cyan-300/35 bg-cyan-500/12 text-cyan-100 hover:border-cyan-300/55 hover:bg-cyan-500/18",
        },
        {
          href: "/build-a-deck",
          label: "Build a Deck",
          pillClass:
            "border-emerald-300/35 bg-emerald-500/12 text-emerald-100 hover:border-emerald-300/55 hover:bg-emerald-500/18",
        },
        {
          href: "/deck/swap-suggestions",
          label: "Budget Swaps",
          pillClass:
            "border-amber-300/35 bg-amber-500/12 text-amber-100 hover:border-amber-300/55 hover:bg-amber-500/18",
        },
        {
          href: "/tools/mulligan",
          label: "Mulligan Simulator",
          pillClass:
            "border-fuchsia-300/35 bg-fuchsia-500/12 text-fuchsia-100 hover:border-fuchsia-300/55 hover:bg-fuchsia-500/18",
        },
      ]}
    />
    <nav className="mt-5 pt-4 border-t border-neutral-800" aria-label="Explore ManaTap">
      <p className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-2">Explore</p>
      <ul className="flex flex-wrap gap-2">
        {EXPLORE_LINKS.map(({ href, label }, i) => (
          <li key={href}>
            <Link href={href} className={`${PILL_BASE_CLASS} ${pillClassAt(i + 2)}`}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
    <PopularCommanders variant="rotator" />
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
