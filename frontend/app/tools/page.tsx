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
  priority?: "recommended" | "popular";
};

const SECTIONS: Array<{ title: string; kicker: string; icon: LucideIcon; accent: string; tools: ToolDef[] }> = [
  {
    title: "Start Here",
    kicker: "Build, analyze, and learn what your deck is trying to do.",
    icon: Wand2,
    accent: "from-amber-300/70 to-violet-300/60",
    tools: [
      {
        href: "/mtg-ai-deck-builder",
        title: "Build a Deck",
        subtitle: "Start a Commander or 60-card list with guided AI help.",
        badge: "Limited",
        icon: Wand2,
        accent: "text-amber-200 border-amber-300/25 bg-amber-300/10",
        priority: "recommended",
      },
      {
        href: "/analyze",
        title: "Analyze a Deck",
        subtitle: "Paste a list and get curve, role, legality, and upgrade notes.",
        badge: "Limited",
        icon: Bot,
        accent: "text-violet-200 border-violet-300/25 bg-violet-300/10",
        priority: "popular",
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
        subtitle: "Check draw odds for lands, combos, and key cards.",
        badge: "Free",
        icon: BarChart3,
        accent: "text-sky-200 border-sky-300/25 bg-sky-300/10",
      },
    ],
  },
  {
    title: "Improve Your Deck",
    kicker: "Find cheaper swaps, compare lists, and finish missing slots.",
    icon: Sparkles,
    accent: "from-emerald-300/70 to-cyan-300/55",
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
        badge: "Pro",
        icon: GitCompare,
        accent: "text-cyan-200 border-cyan-300/25 bg-cyan-300/10",
        priority: "recommended",
      },
      {
        href: "/collections/cost-to-finish",
        title: "Cost to Finish",
        subtitle: "See what you still need and estimate the remaining cost.",
        badge: "Limited",
        icon: ListChecks,
        accent: "text-lime-200 border-lime-300/25 bg-lime-300/10",
      },
    ],
  },
  {
    title: "Search & Track",
    kicker: "Use cards, collections, wishlists, and prices as one workflow.",
    icon: Search,
    accent: "from-amber-300/70 to-sky-300/55",
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
    title: "Extras",
    kicker: "Sharing, discovery, and fun table-talk helpers.",
    icon: ShieldCheck,
    accent: "from-teal-300/70 to-red-300/45",
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
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${classes}`}>{value}</span>;
}

function ToolCard({ tool }: { tool: ToolDef }) {
  const Icon = tool.icon;
  const isPriority = Boolean(tool.priority);
  return (
    <Link
      href={tool.href}
      className={`group relative block h-full overflow-hidden rounded-xl border bg-[linear-gradient(145deg,rgba(18,18,18,0.92),rgba(7,7,8,0.82))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_45px_rgba(0,0,0,0.24)] outline-none transition duration-200 hover:-translate-y-1 hover:bg-[linear-gradient(145deg,rgba(24,24,24,0.96),rgba(9,9,10,0.88))] focus-visible:ring-2 focus-visible:ring-amber-300/70 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        isPriority
          ? "border-amber-300/30 hover:border-amber-200/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_52px_rgba(245,158,11,0.12)]"
          : "border-white/10 hover:border-white/20 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_45px_rgba(0,0,0,0.36)]"
      }`}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
      <span className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-amber-300/0 blur-2xl transition group-hover:bg-amber-300/10" />
      <div className="flex h-full items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] ${tool.accent}`}>
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-start justify-between gap-2">
            <span className="text-[15px] font-bold leading-5 text-white group-hover:text-amber-100">{tool.title}</span>
            <Badge value={tool.badge} />
          </span>
          {tool.priority ? (
            <span className="mt-1 w-fit rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
              {tool.priority === "recommended" ? "Recommended" : "Popular"}
            </span>
          ) : null}
          <span className="mt-2 block text-sm leading-6 text-neutral-400">{tool.subtitle}</span>
          <span className="mt-auto pt-3 text-xs font-semibold text-amber-200/0 transition group-hover:text-amber-200">
            Open →
          </span>
        </span>
      </div>
    </Link>
  );
}

export default function ToolsIndexPage() {
  return (
    <main className="relative w-full max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(251,191,36,0.08),transparent_28%),radial-gradient(circle_at_66%_38%,rgba(34,211,238,0.08),transparent_30%),linear-gradient(90deg,rgba(0,0,0,0.62),rgba(0,0,0,0.28),rgba(0,0,0,0.62))]" />
      <nav className="relative mb-4 text-sm text-neutral-400">
        <Link href="/" className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 rounded">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-neutral-200">Tools</span>
      </nav>

      <section className="relative overflow-hidden rounded-2xl border border-amber-300/22 bg-[linear-gradient(145deg,rgba(10,10,10,0.94),rgba(17,17,18,0.82)_52%,rgba(13,20,19,0.86))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_70px_rgba(0,0,0,0.38)] sm:p-6">
        <div className="pointer-events-none absolute -left-24 -top-24 h-56 w-56 rounded-full bg-amber-300/12 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-amber-200/35 to-transparent" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-48 w-48 rounded-full bg-teal-300/10 blur-3xl" />
        <div className="relative grid gap-5 lg:grid-cols-[1fr_300px] lg:items-center">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">ManaTap toolbox</p>
            <h1 className="mt-3 text-3xl font-black leading-tight text-white md:text-4xl">MTG tools that actually connect</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-neutral-300">
              Build, analyze, compare, search, price, and share from one place. Free tools stay easy to reach; Pro and sign-in features are labelled before you click.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Free tools available", "Deck intelligence", "Pro tools labelled"].map((label) => (
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

      <div className="relative mt-7 space-y-7">
        {SECTIONS.map((section) => {
          const SectionIcon = section.icon;
          return (
            <section key={section.title}>
              <div className="mb-3 flex items-center gap-3">
                <span className={`h-10 w-1 rounded-full bg-gradient-to-b ${section.accent}`} />
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/30 text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <SectionIcon size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-xl font-black leading-6 text-white">{section.title}</h2>
                  <p className="mt-0.5 text-sm text-neutral-400">{section.kicker}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {section.tools.map((tool) => (
                  <ToolCard key={tool.href} tool={tool} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

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
