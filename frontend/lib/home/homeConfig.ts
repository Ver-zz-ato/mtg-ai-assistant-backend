import {
  Bot,
  Boxes,
  Coins,
  Compass,
  Crown,
  Droplet,
  GitCompare,
  HeartHandshake,
  LineChart,
  ListChecks,
  MessageCircleQuestion,
  Sparkles,
  Swords,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { HOME_COMMANDER_GUIDE_COUNT } from "@/lib/home/commanderGuideCount";
import { CHAT_ROUTE } from "@/lib/navigation/chatRoute";

export const APP_STORE_URLS = {
  ios: "https://apps.apple.com/app/id6774626559",
  android: "https://play.google.com/store/apps/details?id=com.manatap.app",
} as const;

/** Flip to true when Google Play listing is live */
export const ANDROID_APP_LIVE = false;

export const HOME_HERO_COPY = {
  kicker: "ManaTap companion",
  headline: "The Ultimate MTG Companion",
  subheadline: "Build decks. Upgrade faster. Track collections. Play smarter.",
  supporting:
    "Everything from deck building and budget upgrades to commander discovery, collection tracking, and AI-powered MTG assistance.",
} as const;

export const HOME_WHY_ITEMS = [
  "Build decks",
  "Find upgrades",
  "Track collections",
  "Discover commanders",
  "Test opening hands",
  "Get AI-powered MTG help",
] as const;

export type HomeProblemTool = {
  label: string;
  href: string;
};

export type HomeProblemCard = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  border: string;
  glow: string;
  iconShell: string;
  toolChipClass: string;
  primaryHref: string;
  tools: HomeProblemTool[];
};

/** Problem-first onboarding cards (Concept 8 merged into /new-home) */
export const HOME_PROBLEM_FINDER: HomeProblemCard[] = [
  {
    id: "weak-deck",
    title: "My deck feels weak",
    description: "Find weak spots and smarter upgrades.",
    icon: Swords,
    accent: "text-emerald-200",
    border: "border-emerald-400/35",
    glow: "from-emerald-500/20 to-transparent",
    iconShell: "border-emerald-300/35 bg-emerald-500/12 text-emerald-100",
    toolChipClass:
      "border-emerald-300/30 bg-emerald-500/10 text-emerald-100 hover:border-emerald-300/50 hover:bg-emerald-500/16",
    primaryHref: "/mtg-deck-checker",
    tools: [
      { label: "Deck Checker", href: "/mtg-deck-checker" },
      { label: "AI Workshop", href: "/ai-workshop" },
      { label: "Deck Compare", href: "/compare-decks" },
    ],
  },
  {
    id: "too-expensive",
    title: "It's too expensive",
    description: "Find cheaper swaps without losing the plan.",
    icon: Coins,
    accent: "text-amber-200",
    border: "border-amber-400/35",
    glow: "from-amber-500/20 to-transparent",
    iconShell: "border-amber-300/35 bg-amber-500/12 text-amber-100",
    toolChipClass:
      "border-amber-300/30 bg-amber-500/10 text-amber-100 hover:border-amber-300/50 hover:bg-amber-500/16",
    primaryHref: "/deck/swap-suggestions",
    tools: [
      { label: "Budget Swaps", href: "/deck/swap-suggestions" },
      { label: "Price Tracker", href: "/price-tracker" },
      { label: "Collections", href: "/collections" },
    ],
  },
  {
    id: "need-commander",
    title: "I need a commander",
    description: "Discover commanders, archetypes, and guides.",
    icon: Crown,
    accent: "text-violet-200",
    border: "border-violet-400/35",
    glow: "from-violet-500/20 to-transparent",
    iconShell: "border-violet-300/35 bg-violet-500/12 text-violet-100",
    toolChipClass:
      "border-violet-300/30 bg-violet-500/10 text-violet-100 hover:border-violet-300/50 hover:bg-violet-500/16",
    primaryHref: "/commanders",
    tools: [
      { label: "Commander Browser", href: "/commanders" },
      { label: "Commander Guides", href: "/commanders" },
      { label: "Meta", href: "/meta" },
    ],
  },
  {
    id: "mana-feels-bad",
    title: "My mana feels bad",
    description: "Check ramp, fixing, lands, and curve.",
    icon: Droplet,
    accent: "text-sky-200",
    border: "border-sky-400/35",
    glow: "from-sky-500/20 to-transparent",
    iconShell: "border-sky-300/35 bg-sky-500/12 text-sky-100",
    toolChipClass:
      "border-sky-300/30 bg-sky-500/10 text-sky-100 hover:border-sky-300/50 hover:bg-sky-500/16",
    primaryHref: "/mtg-deck-checker",
    tools: [
      { label: "Deck Checker", href: "/mtg-deck-checker" },
      { label: "AI Workshop", href: "/ai-workshop" },
      { label: "Probability Calculator", href: "/tools/mulligan#probability" },
    ],
  },
  {
    id: "collection-help",
    title: "I need collection help",
    description: "Organise cards and build from what you own.",
    icon: Boxes,
    accent: "text-teal-200",
    border: "border-teal-400/35",
    glow: "from-teal-500/20 to-transparent",
    iconShell: "border-teal-300/35 bg-teal-500/12 text-teal-100",
    toolChipClass:
      "border-teal-300/30 bg-teal-500/10 text-teal-100 hover:border-teal-300/50 hover:bg-teal-500/16",
    primaryHref: "/collections",
    tools: [
      { label: "Collections", href: "/collections" },
      { label: "Wishlist", href: "/wishlist" },
      { label: "Card Search", href: "/cards" },
    ],
  },
  {
    id: "mtg-question",
    title: "I have an MTG question",
    description: "Ask rules, strategy, deckbuilding, or card questions.",
    icon: MessageCircleQuestion,
    accent: "text-fuchsia-200",
    border: "border-fuchsia-400/40",
    glow: "from-fuchsia-500/25 to-transparent",
    iconShell: "border-fuchsia-300/35 bg-fuchsia-500/12 text-fuchsia-100",
    toolChipClass:
      "border-fuchsia-300/30 bg-fuchsia-500/10 text-fuchsia-100 hover:border-fuchsia-300/50 hover:bg-fuchsia-500/16",
    primaryHref: CHAT_ROUTE,
    tools: [{ label: "AI Chat", href: CHAT_ROUTE }],
  },
];

export type HomePillarLink = {
  href: string;
  label: string;
  /** Tailwind classes for pill border, background, text, and hover */
  pillClass: string;
};

export type HomePillar = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  border: string;
  glow: string;
  /** Primary route for compact category navigation */
  categoryHref: string;
  navPillClass: string;
  featured?: boolean;
  links: HomePillarLink[];
};

export const HOME_PILLARS: HomePillar[] = [
  {
    id: "build",
    title: "Build",
    description: "Start from a commander, an idea, or cards you already own.",
    icon: Wand2,
    accent: "text-emerald-200",
    border: "border-emerald-400/35",
    glow: "from-emerald-500/20 to-transparent",
    categoryHref: "/build-a-deck",
    navPillClass:
      "border-emerald-300/35 bg-emerald-500/10 text-emerald-100 hover:border-emerald-300/55 hover:bg-emerald-500/16",
    links: [
      {
        href: "/build-a-deck",
        label: "Deck Builder",
        pillClass:
          "border-emerald-300/35 bg-emerald-500/12 text-emerald-100 hover:border-emerald-300/55 hover:bg-emerald-500/18",
      },
      {
        href: "/commanders",
        label: "Commander Browser",
        pillClass:
          "border-teal-300/35 bg-teal-500/12 text-teal-100 hover:border-teal-300/55 hover:bg-teal-500/18",
      },
      {
        href: "/decks/browse",
        label: "Browse Decks",
        pillClass:
          "border-lime-300/35 bg-lime-500/12 text-lime-100 hover:border-lime-300/55 hover:bg-lime-500/18",
      },
    ],
  },
  {
    id: "improve",
    title: "Improve",
    description: "Spot weak slots, compare lists, and find smarter upgrades.",
    icon: Sparkles,
    accent: "text-violet-200",
    border: "border-violet-400/35",
    glow: "from-violet-500/20 to-transparent",
    categoryHref: "/mtg-deck-checker",
    navPillClass:
      "border-violet-300/35 bg-violet-500/10 text-violet-100 hover:border-violet-300/55 hover:bg-violet-500/16",
    links: [
      {
        href: "/deck/swap-suggestions",
        label: "Budget Swaps",
        pillClass:
          "border-violet-300/35 bg-violet-500/12 text-violet-100 hover:border-violet-300/55 hover:bg-violet-500/18",
      },
      {
        href: "/compare-decks",
        label: "Deck Compare",
        pillClass:
          "border-purple-300/35 bg-purple-500/12 text-purple-100 hover:border-purple-300/55 hover:bg-purple-500/18",
      },
      {
        href: "/mtg-deck-checker",
        label: "Deck Checker",
        pillClass:
          "border-cyan-300/35 bg-cyan-500/12 text-cyan-100 hover:border-cyan-300/55 hover:bg-cyan-500/18",
      },
      {
        href: "/ai-workshop",
        label: "AI Workshop",
        pillClass:
          "border-fuchsia-300/35 bg-fuchsia-500/12 text-fuchsia-100 hover:border-fuchsia-300/55 hover:bg-fuchsia-500/18",
      },
    ],
  },
  {
    id: "track",
    title: "Track",
    description: "Manage collections, wishlists, prices, and deck gaps in one place.",
    icon: Boxes,
    accent: "text-amber-200",
    border: "border-amber-400/35",
    glow: "from-amber-500/20 to-transparent",
    categoryHref: "/collections",
    navPillClass:
      "border-amber-300/35 bg-amber-500/10 text-amber-100 hover:border-amber-300/55 hover:bg-amber-500/16",
    links: [
      {
        href: "/collections",
        label: "Collections",
        pillClass:
          "border-amber-300/35 bg-amber-500/12 text-amber-100 hover:border-amber-300/55 hover:bg-amber-500/18",
      },
      {
        href: "/wishlist",
        label: "Wishlist",
        pillClass:
          "border-orange-300/35 bg-orange-500/12 text-orange-100 hover:border-orange-300/55 hover:bg-orange-500/18",
      },
      {
        href: "/price-tracker",
        label: "Price Tracker",
        pillClass:
          "border-sky-300/35 bg-sky-500/12 text-sky-100 hover:border-sky-300/55 hover:bg-sky-500/18",
      },
      {
        href: "/cards",
        label: "Card Search",
        pillClass:
          "border-yellow-300/35 bg-yellow-500/12 text-yellow-100 hover:border-yellow-300/55 hover:bg-yellow-500/18",
      },
    ],
  },
  {
    id: "play",
    title: "Play",
    description: "Test hands, model odds, and make faster table decisions.",
    icon: HeartHandshake,
    accent: "text-sky-200",
    border: "border-sky-400/35",
    glow: "from-sky-500/20 to-transparent",
    categoryHref: "/tools/mulligan",
    navPillClass:
      "border-sky-300/35 bg-sky-500/10 text-sky-100 hover:border-sky-300/55 hover:bg-sky-500/16",
    links: [
      {
        href: "/tools/mulligan",
        label: "Mulligan Simulator",
        pillClass:
          "border-sky-300/35 bg-sky-500/12 text-sky-100 hover:border-sky-300/55 hover:bg-sky-500/18",
      },
      {
        href: "/tools/mulligan#probability",
        label: "Probability Calculator",
        pillClass:
          "border-cyan-300/35 bg-cyan-500/12 text-cyan-100 hover:border-cyan-300/55 hover:bg-cyan-500/18",
      },
    ],
  },
  {
    id: "discover",
    title: "Discover",
    description: "Follow meta movement, archetypes, and commander guides.",
    icon: Compass,
    accent: "text-rose-200",
    border: "border-rose-400/35",
    glow: "from-rose-500/20 to-transparent",
    categoryHref: "/commanders",
    navPillClass:
      "border-rose-300/35 bg-rose-500/10 text-rose-100 hover:border-rose-300/55 hover:bg-rose-500/16",
    links: [
      {
        href: "/meta",
        label: "Meta",
        pillClass:
          "border-rose-300/35 bg-rose-500/12 text-rose-100 hover:border-rose-300/55 hover:bg-rose-500/18",
      },
      {
        href: "/commanders",
        label: "Commander Guides",
        pillClass:
          "border-pink-300/35 bg-pink-500/12 text-pink-100 hover:border-pink-300/55 hover:bg-pink-500/18",
      },
      {
        href: "/commander-archetypes",
        label: "Archetypes",
        pillClass:
          "border-orange-300/35 bg-orange-500/12 text-orange-100 hover:border-orange-300/55 hover:bg-orange-500/18",
      },
      {
        href: "/decks/browse",
        label: "Browse Decks",
        pillClass:
          "border-red-300/35 bg-red-500/12 text-red-100 hover:border-red-300/55 hover:bg-red-500/18",
      },
    ],
  },
  {
    id: "ai",
    title: "AI",
    description: "Rules help, deck tuning, roasts, and focused MTG assistance.",
    icon: Bot,
    accent: "text-fuchsia-100",
    border: "border-fuchsia-400/45",
    glow: "from-fuchsia-500/30 via-violet-500/15 to-transparent",
    featured: true,
    categoryHref: CHAT_ROUTE,
    navPillClass:
      "border-fuchsia-300/40 bg-fuchsia-500/12 text-fuchsia-100 hover:border-fuchsia-300/60 hover:bg-fuchsia-500/18",
    links: [
      {
        href: CHAT_ROUTE,
        label: "AI Chat",
        pillClass:
          "border-fuchsia-300/40 bg-fuchsia-500/14 text-fuchsia-100 hover:border-fuchsia-300/60 hover:bg-fuchsia-500/22",
      },
      {
        href: "/roast",
        label: "Roast My Deck",
        pillClass:
          "border-violet-300/40 bg-violet-500/14 text-violet-100 hover:border-violet-300/60 hover:bg-violet-500/22",
      },
      {
        href: "/ai-workshop",
        label: "AI Workshop",
        pillClass:
          "border-purple-300/40 bg-purple-500/14 text-purple-100 hover:border-purple-300/60 hover:bg-purple-500/22",
      },
    ],
  },
];

export type HomePopularTool = {
  href: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  accent: string;
  badge?: string;
};

export const HOME_POPULAR_TOOLS: HomePopularTool[] = [
  {
    href: "/build-a-deck",
    title: "Deck Builder",
    subtitle: "Start a Commander or 60-card list with guided help.",
    icon: Wand2,
    accent: "text-amber-200 border-amber-300/25 bg-amber-300/10",
    badge: "Most Popular",
  },
  {
    href: "/deck/swap-suggestions",
    title: "Budget Swaps",
    subtitle: "Find cheaper alternatives without losing the deck's plan.",
    icon: Sparkles,
    accent: "text-emerald-200 border-emerald-300/25 bg-emerald-300/10",
    badge: "Community Favourite",
  },
  {
    href: "/compare-decks",
    title: "Deck Compare",
    subtitle: "Compare two or three decks side by side.",
    icon: GitCompare,
    accent: "text-cyan-200 border-cyan-300/25 bg-cyan-300/10",
  },
  {
    href: "/mtg-deck-checker",
    title: "Deck Checker",
    subtitle: "Paste a list and check curve, mana, roles, and weak slots.",
    icon: ListChecks,
    accent: "text-cyan-200 border-cyan-300/25 bg-cyan-300/10",
  },
  {
    href: "/collections",
    title: "Collections",
    subtitle: "Track owned cards and use them in deck-building tools.",
    icon: Boxes,
    accent: "text-orange-200 border-orange-300/25 bg-orange-300/10",
    badge: "Power Users",
  },
  {
    href: "/tools/mulligan",
    title: "Mulligan Simulator",
    subtitle: "Test opening hands with London mulligan rules.",
    icon: HeartHandshake,
    accent: "text-rose-200 border-rose-300/25 bg-rose-300/10",
  },
  {
    href: "/price-tracker",
    title: "Price Tracker",
    subtitle: "Track card movement, trends, and value changes.",
    icon: LineChart,
    accent: "text-sky-200 border-sky-300/25 bg-sky-300/10",
  },
  {
    href: CHAT_ROUTE,
    title: "AI Chat",
    subtitle: "Ask rules questions and get focused MTG help.",
    icon: Bot,
    accent: "text-violet-200 border-violet-300/25 bg-violet-300/10",
    badge: "New Players",
  },
];

export const HOME_TRUST_CAPABILITIES = [
  { label: "Deck building", accent: "text-violet-300" },
  { label: "Budget upgrades", accent: "text-emerald-300" },
  { label: "Collection tracking", accent: "text-sky-300" },
  { label: "Commander discovery", accent: "text-rose-300" },
  { label: "AI assistance", accent: "text-fuchsia-300" },
  { label: "Game night tools", accent: "text-amber-300" },
] as const;

export const HOME_HERO_TOOLS = [
  { href: "/mtg-deck-checker", img: "/tool-deck-checker.png", alt: "Deck Checker" },
  { href: "/deck/swap-suggestions", img: "/tool-budget-swaps.png", alt: "Budget Swaps" },
  { href: "/price-tracker", img: "/tool-price-tracker.png", alt: "Price Tracker" },
  { href: "/tools/mulligan", img: "/tool-mulligan-lab.png", alt: "Mulligan Lab" },
  { href: "/build-a-deck", img: "/tool-build-a-deck.png", alt: "Build a Deck" },
  { href: CHAT_ROUTE, img: "/tool-ai-chat.png", alt: "AI Chat" },
] as const;

/** Tool-banner assets used until real iOS screenshots are added under /public/app-screenshots/ */
export const HOME_APP_SHOWCASE = [
  { label: "Deck Checker", img: "/tool-deck-checker.png", href: "/mtg-deck-checker" },
  { label: "Budget Swaps", img: "/tool-budget-swaps.png", href: "/deck/swap-suggestions" },
  { label: "Deck Builder", img: "/tool-build-a-deck.png", href: "/build-a-deck" },
  { label: "Mulligan Lab", img: "/tool-mulligan-lab.png", href: "/tools/mulligan" },
] as const;

/** Commander hub pages in catalog — used for Community Highlights count */
export { HOME_COMMANDER_GUIDE_COUNT } from "@/lib/home/commanderGuideCount";

export type HomeCommunityHighlight = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  accent: string;
  /** When set, label may include a live stat from meta API */
  statKey?: "publicDecks";
  /** Static suffix when statKey resolves (e.g. "Public Decks") */
  statLabel?: string;
  /** Static count from catalog — not invented */
  staticCount?: number;
  staticCountSuffix?: string;
};

export const HOME_COMMUNITY_HIGHLIGHTS: HomeCommunityHighlight[] = [
  {
    id: "public-decks",
    label: "Public Decks",
    href: "/decks/browse",
    icon: Boxes,
    accent: "text-violet-300 border-violet-400/30 bg-violet-500/10",
    statKey: "publicDecks",
    statLabel: "Public Decks",
  },
  {
    id: "commander-guides",
    label: "Commander Guides",
    href: "/commanders",
    icon: Compass,
    accent: "text-cyan-300 border-cyan-400/30 bg-cyan-500/10",
    staticCount: HOME_COMMANDER_GUIDE_COUNT,
    staticCountSuffix: "Commander Guides",
  },
  {
    id: "meta-tracking",
    label: "Meta Tracking",
    href: "/meta",
    icon: LineChart,
    accent: "text-fuchsia-300 border-fuchsia-400/30 bg-fuchsia-500/10",
  },
  {
    id: "budget-swaps",
    label: "Budget Swaps",
    href: "/deck/swap-suggestions",
    icon: Sparkles,
    accent: "text-emerald-300 border-emerald-400/30 bg-emerald-500/10",
  },
];

export const HOME_PRO_BENEFITS = [
  "Higher AI limits",
  "Deeper deck analysis",
  "Advanced deck tools",
] as const;
