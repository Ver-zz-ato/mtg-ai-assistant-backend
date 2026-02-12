import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "MTG Tools | Mulligan Simulator, Probability, Cost to Finish | ManaTap AI",
  description:
    "Free MTG tools for Commander: mulligan simulator, probability calculator, cost to finish, budget swaps, price tracker. Optimize your deck without signup.",
  alternates: { canonical: "https://www.manatap.ai/tools" },
};

const TOOLS = [
  {
    href: "/tools/mulligan",
    label: "Mulligan Simulator",
    description:
      "Simulate thousands of opening hands with London mulligan rules. See keep rates for 7/6/5 card hands. Commander's free first mulligan supported.",
  },
  {
    href: "/tools/probability",
    label: "Probability Calculator",
    description:
      "Hypergeometric calculator for draw odds. Answer questions like \"What are the odds I draw Sol Ring by turn 2?\" or \"How many copies of my combo piece do I need?\"",
  },
  {
    href: "/collections/cost-to-finish",
    label: "Cost to Finish",
    description:
      "Paste a decklist to estimate how much it costs to complete. Subtract cards you own from a collection to see your true cost to finish. Multiple currencies.",
  },
  {
    href: "/deck/swap-suggestions",
    label: "Budget Swap Optimizer",
    description:
      "Find cheaper alternatives for expensive cards. Set a price threshold and get suggestions. Pro users get AI-powered swaps that maintain deck synergy.",
  },
  {
    href: "/price-tracker",
    label: "Price Tracker",
    description:
      "Track card prices over time with historical charts. Watch your favorite cards, compare trends, and export data. Sign in for deck value tracking.",
  },
];

export default function ToolsIndexPage() {
  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Tools</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
          MTG Tools
        </h1>
        <div className="text-neutral-300 mb-10 space-y-4 text-lg leading-relaxed">
          <p>
            ManaTap provides free tools to help you build, tune, and optimize
            your Commander decks. From mulligan simulation to budget planning,
            these calculators and utilities work without signup — paste a
            decklist or load from your account and get instant results.
          </p>
          <p>
            Use the mulligan simulator to see how often you&apos;ll keep your
            opener under London rules. The probability calculator answers
            draw-odds questions with hypergeometric math. Cost to finish
            estimates how much you need to spend to complete a deck, and the
            budget swap tool finds cheaper alternatives for expensive cards. The
            price tracker shows historical trends to help you buy at the right
            time.
          </p>
          <p>
            All tools are designed for Commander (99-card decks) but support
            other formats. No signup required to try them.
          </p>
        </div>
        <div className="space-y-6">
          {TOOLS.map(({ href, label, description }) => (
            <div
              key={href}
              className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4 hover:border-neutral-600 transition-colors"
            >
              <a
                href={href}
                className="block group"
              >
                <h2 className="text-xl font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors">
                  {label}
                </h2>
                <p className="text-neutral-400 text-sm leading-relaxed">
                  {description}
                </p>
                <span className="inline-block mt-2 text-blue-400 text-sm font-medium">
                  Try {label} →
                </span>
              </a>
            </div>
          ))}
        </div>
        <div className="mt-10 pt-6 border-t border-neutral-700">
          <Link
            href="/commanders"
            className="text-blue-400 hover:underline font-medium"
          >
            Browse commanders →
          </Link>
          <span className="mx-2 text-neutral-500">|</span>
          <Link
            href="/decks/browse"
            className="text-blue-400 hover:underline font-medium"
          >
            Browse decks →
          </Link>
        </div>
      </article>
    </main>
  );
}
