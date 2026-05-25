import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  Bot,
  Boxes,
  Flame,
  GitCompare,
  HeartHandshake,
  LineChart,
  ListChecks,
  Search,
  ShieldCheck,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import ProFeatureCard from "@/components/ProFeatureCard";

export const metadata: Metadata = {
  title: "MTG Tools | ManaTap AI",
  description:
    "ManaTap tools for deck building, deck analysis, mulligans, probability, budget swaps, price tracking, card search, QR sharing, collections, and Commander discovery.",
  alternates: { canonical: "https://www.manatap.ai/tools" },
};

type ToolBadge = "Free" | "Sign in" | "Pro" | "Limited";

type ToolDef = {
  href: string;
  title: string;
  subtitle: string;
  badge: ToolBadge;
  icon: LucideIcon;
  accent: string;
};

const SECTIONS: Array<{ title: string; kicker: string; tools: ToolDef[] }> = [
  {
    title: "Start Here",
    kicker: "Build, analyze, and learn what your deck is trying to do.",
    tools: [
      {
        href: "/mtg-ai-deck-builder",
        title: "Build a Deck",
        subtitle: "Commander and 60-card deck starts with AI help.",
        badge: "Limited",
        icon: Wand2,
        accent: "text-amber-200 border-amber-300/25 bg-amber-300/10",
      },
      {
        href: "/analyze",
        title: "Analyze a Deck",
        subtitle: "Paste a list and get curve, roles, legality, and upgrade notes.",
        badge: "Limited",
        icon: Bot,
        accent: "text-violet-200 border-violet-300/25 bg-violet-300/10",
      },
      {
        href: "/tools/mulligan",
        title: "Mulligan Simulator",
        subtitle: "Test opening hands with London mulligan rules.",
        badge: "Free",
        icon: HeartHandshake,
        accent: "text-rose-200 border-rose-300/25 bg-rose-300/10",
      },
      {
        href: "/tools/probability",
        title: "Probability Calculator",
        subtitle: "Calculate draw odds for combo pieces, lands, and interaction.",
        badge: "Free",
        icon: BarChart3,
        accent: "text-sky-200 border-sky-300/25 bg-sky-300/10",
      },
    ],
  },
  {
    title: "Improve Your Deck",
    kicker: "Find cheaper swaps, compare lists, and finish missing slots.",
    tools: [
      {
        href: "/budget-swaps",
        title: "Budget Swaps",
        subtitle: "Find cheaper alternatives without losing the deck's plan.",
        badge: "Limited",
        icon: Sparkles,
        accent: "text-emerald-200 border-emerald-300/25 bg-emerald-300/10",
      },
      {
        href: "/compare-decks",
        title: "Deck Compare",
        subtitle: "Compare two decks side by side for overlap and gaps.",
        badge: "Pro",
        icon: GitCompare,
        accent: "text-cyan-200 border-cyan-300/25 bg-cyan-300/10",
      },
      {
        href: "/collections/cost-to-finish",
        title: "Cost to Finish",
        subtitle: "Subtract owned cards and estimate what a deck still costs.",
        badge: "Limited",
        icon: ListChecks,
        accent: "text-lime-200 border-lime-300/25 bg-lime-300/10",
      },
    ],
  },
  {
    title: "Search & Track",
    kicker: "Use cards, collections, wishlists, and prices as one workflow.",
    tools: [
      {
        href: "/cards",
        title: "Card Search",
        subtitle: "Search cards, open details, explain cards, and jump into prices.",
        badge: "Free",
        icon: Search,
        accent: "text-amber-200 border-amber-300/25 bg-amber-300/10",
      },
      {
        href: "/price-tracker",
        title: "Price Tracker",
        subtitle: "Track card movement, watch trends, and compare values.",
        badge: "Limited",
        icon: LineChart,
        accent: "text-sky-200 border-sky-300/25 bg-sky-300/10",
      },
      {
        href: "/wishlist",
        title: "Wishlist",
        subtitle: "Save cards you want next and compare against your collection.",
        badge: "Sign in",
        icon: BookOpen,
        accent: "text-fuchsia-200 border-fuchsia-300/25 bg-fuchsia-300/10",
      },
      {
        href: "/collections",
        title: "Collections",
        subtitle: "Track owned cards and use them in deck-building tools.",
        badge: "Sign in",
        icon: Boxes,
        accent: "text-orange-200 border-orange-300/25 bg-orange-300/10",
      },
    ],
  },
  {
    title: "Extras",
    kicker: "Sharing, discovery, and fun table-talk helpers.",
    tools: [
      {
        href: "/tools/scan-qr",
        title: "Scan QR",
        subtitle: "Open ManaTap share links from decks, collections, cards, and reports.",
        badge: "Free",
        icon: ShieldCheck,
        accent: "text-emerald-200 border-emerald-300/25 bg-emerald-300/10",
      },
      {
        href: "/roast",
        title: "Roast My Deck",
        subtitle: "Get a funny AI roast and share the permalink.",
        badge: "Limited",
        icon: Flame,
        accent: "text-red-200 border-red-300/25 bg-red-300/10",
      },
      {
        href: "/commanders",
        title: "Commander Browser",
        subtitle: "Browse commanders by archetype, strategy, and play pattern.",
        badge: "Free",
        icon: Search,
        accent: "text-indigo-200 border-indigo-300/25 bg-indigo-300/10",
      },
      {
        href: "/meta",
        title: "Meta",
        subtitle: "Explore trending decks, commanders, and card signals.",
        badge: "Free",
        icon: BarChart3,
        accent: "text-teal-200 border-teal-300/25 bg-teal-300/10",
      },
    ],
  },
];

function Badge({ value }: { value: ToolBadge }) {
  const classes =
    value === "Pro"
      ? "border-amber-300/30 bg-amber-300/15 text-amber-100"
      : value === "Sign in"
        ? "border-sky-300/25 bg-sky-300/10 text-sky-100"
        : value === "Limited"
          ? "border-violet-300/25 bg-violet-300/10 text-violet-100"
          : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${classes}`}>{value}</span>;
}

function ToolCard({ tool }: { tool: ToolDef }) {
  const Icon = tool.icon;
  return (
    <Link
      href={tool.href}
      className="group block rounded-lg border border-white/10 bg-neutral-950/75 p-4 transition hover:-translate-y-0.5 hover:border-amber-300/35 hover:bg-neutral-900"
    >
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${tool.accent}`}>
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="text-base font-semibold text-white group-hover:text-amber-100">{tool.title}</span>
            <Badge value={tool.badge} />
          </span>
          <span className="mt-1 block text-sm leading-6 text-neutral-400">{tool.subtitle}</span>
        </span>
      </div>
    </Link>
  );
}

export default function ToolsIndexPage() {
  return (
    <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <nav className="mb-4 text-sm text-neutral-400">
        <Link href="/" className="hover:text-white">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-neutral-200">Tools</span>
      </nav>

      <section className="rounded-xl border border-amber-300/20 bg-neutral-950/80 p-5 shadow-xl shadow-black/20">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-300">ManaTap toolbox</p>
        <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_320px] lg:items-end">
          <div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">MTG tools that actually connect</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-neutral-300">
              Build, analyze, compare, search, price, and share from one place. Free tools stay easy to reach; Pro and sign-in features are labelled before you click.
            </p>
          </div>
          <ProFeatureCard
            feature="tools_hub_upgrade"
            location="tools_hub"
            title="Pro goes deeper"
            description="Higher AI limits, deeper comparisons, deck value tracking, and stronger upgrade explanations."
            compact
          />
        </div>
      </section>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{section.title}</h2>
                <p className="text-sm text-neutral-400">{section.kicker}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {section.tools.map((tool) => (
                <ToolCard key={tool.href} tool={tool} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-10 rounded-lg border border-white/10 bg-neutral-950/70 p-4 text-sm text-neutral-400">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/commander-archetypes" className="text-amber-200 hover:underline">Commander archetypes</Link>
          <Link href="/decks/browse" className="text-amber-200 hover:underline">Browse public decks</Link>
          <Link href="/pricing" className="text-amber-200 hover:underline">ManaTap Pro</Link>
        </div>
      </section>
    </main>
  );
}
