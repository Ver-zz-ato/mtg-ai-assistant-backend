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
  Search,
  Sparkles,
  Wand2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import ProFeatureCard from "@/components/ProFeatureCard";
import { CHAT_ROUTE } from "@/lib/navigation/chatRoute";

export const metadata: Metadata = {
  title: "MTG Tools | ManaTap AI",
  description:
    "ManaTap tools for deck building, deck analysis, mulligans, budget swaps, price tracking, card search, collections, and Commander discovery.",
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
  priority?: "recommended" | "popular";
};

type JourneyStage = {
  step: number;
  title: string;
  kicker: string;
  icon: LucideIcon;
  accent: string;
  node: string;
  tools: ToolDef[];
};

const JOURNEY: JourneyStage[] = [
  {
    step: 1,
    title: "Build",
    kicker: "Bring your idea into a real list.",
    icon: Wand2,
    accent: "from-violet-400/60 to-amber-300/45",
    node: "border-violet-300/45 bg-violet-500/15 text-violet-100 shadow-violet-500/25",
    tools: [
      {
        href: "/build-a-deck",
        title: "Build a Deck",
        subtitle: "Start a Commander or 60-card list with guided AI help.",
        badge: "Limited",
        icon: Wand2,
        accent: "text-amber-200 border-amber-300/25 bg-amber-300/10",
        priority: "recommended",
      },
      {
        href: "/ai-workshop",
        title: "AI Workshop",
        subtitle: "Run focused AI passes on mana, curve, budget, power, or legality.",
        badge: "Limited",
        icon: Wrench,
        accent: "text-violet-200 border-violet-300/25 bg-violet-300/10",
        priority: "recommended",
      },
    ],
  },
  {
    step: 2,
    title: "Analyze",
    kicker: "Find what the list is really doing.",
    icon: Bot,
    accent: "from-sky-400/60 to-cyan-300/45",
    node: "border-sky-300/45 bg-sky-500/15 text-sky-100 shadow-sky-500/25",
    tools: [
      {
        href: "/mtg-deck-checker",
        title: "Deck Checker",
        subtitle: "Paste a list and get curve, role, legality, and upgrade notes.",
        badge: "Limited",
        icon: Bot,
        accent: "text-violet-200 border-violet-300/25 bg-violet-300/10",
        priority: "popular",
      },
      {
        href: CHAT_ROUTE,
        title: "AI Chat",
        subtitle: "Ask rules questions, tune your deck, and get focused MTG help.",
        badge: "Limited",
        icon: Bot,
        accent: "text-fuchsia-200 border-fuchsia-300/25 bg-fuchsia-300/10",
        priority: "popular",
      },
    ],
  },
  {
    step: 3,
    title: "Improve",
    kicker: "Fix weak slots and sharpen the plan.",
    icon: Sparkles,
    accent: "from-emerald-400/60 to-cyan-300/45",
    node: "border-emerald-300/45 bg-emerald-500/15 text-emerald-100 shadow-emerald-500/25",
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
        subtitle: "Compare two or three decks side by side.",
        badge: "Sign in",
        icon: GitCompare,
        accent: "text-cyan-200 border-cyan-300/25 bg-cyan-300/10",
        priority: "recommended",
      },
      {
        href: "/collections/cost-to-finish",
        title: "Cost to Finish",
        subtitle: "See what your deck still needs and what it costs from your collection.",
        badge: "Limited",
        icon: Boxes,
        accent: "text-orange-200 border-orange-300/25 bg-orange-300/10",
      },
    ],
  },
  {
    step: 4,
    title: "Track",
    kicker: "Keep cards, prices, and wants organized.",
    icon: Search,
    accent: "from-amber-400/60 to-sky-300/45",
    node: "border-amber-300/45 bg-amber-500/15 text-amber-100 shadow-amber-500/25",
    tools: [
      {
        href: "/cards",
        title: "Card Search",
        subtitle: "Search cards, prices, legality, and details fast.",
        badge: "Free",
        icon: Search,
        accent: "text-amber-200 border-amber-300/25 bg-amber-300/10",
        priority: "popular",
      },
      {
        href: "/price-tracker",
        title: "Price Tracker",
        subtitle: "Track card movement, trends, and value changes.",
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
    step: 5,
    title: "Discover",
    kicker: "Find ideas from commanders and meta signals.",
    icon: BarChart3,
    accent: "from-orange-400/60 to-red-300/45",
    node: "border-orange-300/45 bg-orange-500/15 text-orange-100 shadow-orange-500/25",
    tools: [
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
      {
        href: "/decks/browse",
        title: "Public Decks",
        subtitle: "Browse public lists for ideas, commanders, and upgrade paths.",
        badge: "Free",
        icon: BookOpen,
        accent: "text-amber-200 border-amber-300/25 bg-amber-300/10",
      },
    ],
  },
  {
    step: 6,
    title: "Play",
    kicker: "Test the hands before game night.",
    icon: HeartHandshake,
    accent: "from-pink-400/60 to-rose-300/45",
    node: "border-rose-300/45 bg-rose-500/15 text-rose-100 shadow-rose-500/25",
    tools: [
      {
        href: "/tools/mulligan",
        title: "Mulligan Simulator",
        subtitle: "Test opening hands with London mulligan rules.",
        badge: "Free",
        icon: HeartHandshake,
        accent: "text-rose-200 border-rose-300/25 bg-rose-300/10",
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
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${classes}`}>
      {value}
    </span>
  );
}

function ToolRow({ tool }: { tool: ToolDef }) {
  const Icon = tool.icon;
  const isPriority = Boolean(tool.priority);
  return (
    <Link
      href={tool.href}
      className={`group relative flex gap-2.5 rounded-lg border bg-black/35 p-2.5 outline-none transition duration-200 hover:-translate-y-0.5 hover:bg-black/55 focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        isPriority
          ? "border-amber-300/25 hover:border-amber-200/55 hover:shadow-[0_12px_34px_rgba(245,158,11,0.12)]"
          : "border-white/10 hover:border-white/25 hover:shadow-[0_12px_34px_rgba(0,0,0,0.34)]"
      }`}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] ${tool.accent}`}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-bold leading-5 text-white group-hover:text-amber-100">{tool.title}</span>
          <Badge value={tool.badge} />
        </span>
        <span className="mt-1 block text-xs leading-5 text-neutral-400">{tool.subtitle}</span>
        {tool.priority ? (
          <span className="mt-2 inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
            {tool.priority === "recommended" ? "Recommended" : "Popular"}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export default function ToolsIndexPage() {
  return (
    <main className="relative mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(124,58,237,0.13),transparent_30%),radial-gradient(circle_at_76%_38%,rgba(251,146,60,0.09),transparent_28%),radial-gradient(circle_at_22%_46%,rgba(34,211,238,0.08),transparent_30%),linear-gradient(90deg,rgba(0,0,0,0.72),rgba(7,7,12,0.34),rgba(0,0,0,0.72))]" />
      <nav className="relative mb-4 text-sm text-neutral-400">
        <Link href="/" className="rounded hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-neutral-200">Tools</span>
      </nav>

      <section className="relative overflow-hidden rounded-2xl border border-violet-300/22 bg-[linear-gradient(145deg,rgba(10,10,16,0.95),rgba(17,17,25,0.84)_52%,rgba(13,20,22,0.86))] p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_70px_rgba(0,0,0,0.38)] sm:p-8">
        <div className="pointer-events-none absolute -left-24 -top-24 h-56 w-56 rounded-full bg-amber-300/12 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-amber-200/35 to-transparent" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-48 w-48 rounded-full bg-teal-300/10 blur-3xl" />
        <div className="relative grid gap-5 lg:grid-cols-[1fr_300px] lg:items-center">
          <div className="min-w-0 lg:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">ManaTap tools</p>
            <h1 className="mt-3 text-4xl font-black leading-tight text-white md:text-5xl">Your deckbuilding journey</h1>
            <p className="mx-auto mt-3 max-w-3xl text-base leading-7 text-neutral-300 lg:mx-0">
              From idea to table. ManaTap helps at every step.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">
              {["Build", "Analyze", "Improve", "Track", "Discover", "Play"].map((label) => (
                <span key={label} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-neutral-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <ProFeatureCard
              feature="tools_hub_upgrade"
              location="tools_hub"
              title="Pro goes deeper"
              description="Higher limits, deeper comparisons, deck value tracking, and stronger upgrade explanations."
              compact
            />
          </div>
        </div>
      </section>

      <div className="relative mt-8 overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_80px_rgba(0,0,0,0.35)] sm:p-5">
        <div className="pointer-events-none absolute left-8 right-8 top-[5.75rem] hidden h-px bg-gradient-to-r from-violet-400/35 via-amber-300/45 to-rose-400/35 lg:block" />
        <div className="grid gap-4 lg:grid-cols-6">
          {JOURNEY.map((stage) => {
            const StageIcon = stage.icon;
            return (
              <section key={stage.title} className="relative grid gap-3 lg:block">
                <div className="flex items-center gap-3 lg:min-h-36 lg:flex-col lg:text-center">
                  <div className="min-w-0 lg:min-h-16">
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-neutral-500">{stage.step}. {stage.title}</div>
                    <p className="mt-1 text-xs leading-5 text-neutral-400">{stage.kicker}</p>
                  </div>
                  <div className={`relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-full border shadow-2xl ${stage.node}`}>
                    <StageIcon size={25} aria-hidden="true" />
                  </div>
                </div>
                <div className={`rounded-xl border bg-gradient-to-br ${stage.accent} p-px`}>
                  <div className="space-y-2 rounded-[11px] bg-neutral-950/90 p-2.5">
                    {stage.tools.map((tool) => (
                      <ToolRow key={tool.href} tool={tool} />
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <section className="relative mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-violet-300/20 bg-violet-500/10 p-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <h2 className="text-lg font-black text-white">Not sure where to start?</h2>
        <Link
          href="/build-a-deck"
          className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-violet-950/35 transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          Take me to Build a Deck
        </Link>
      </section>

      <section className="relative mt-8 rounded-xl border border-white/10 bg-black/35 p-3 text-sm text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">More from ManaTap</span>
          <div className="flex flex-wrap gap-2">
            {[
              { href: "/commander-archetypes", label: "Commander archetypes" },
              { href: "/decks/browse", label: "Browse public decks" },
              { href: "/pricing", label: "ManaTap Pro" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-amber-300/15 bg-amber-300/5 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:border-amber-200/45 hover:bg-amber-300/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
