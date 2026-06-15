import {
  Bot,
  Boxes,
  GitCompare,
  HeartHandshake,
  LineChart,
  ListChecks,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";

export const APP_STORE_URLS = {
  ios: "https://apps.apple.com/app/id6774626559",
  android: "https://play.google.com/store/apps/details?id=com.manatap.app",
} as const;

export type HomePillarLink = {
  href: string;
  label: string;
};

export type HomePillar = {
  id: string;
  title: string;
  description: string;
  accent: string;
  border: string;
  glow: string;
  links: HomePillarLink[];
};

export const HOME_PILLARS: HomePillar[] = [
  {
    id: "build",
    title: "Build",
    description: "Create new decks from commanders, ideas, or your collection.",
    accent: "text-emerald-200",
    border: "border-emerald-400/30",
    glow: "from-emerald-500/15 to-transparent",
    links: [
      { href: "/build-a-deck", label: "Deck Builder" },
      { href: "/commanders", label: "Commander Browser" },
      { href: "/decks/browse", label: "Browse Decks" },
    ],
  },
  {
    id: "improve",
    title: "Improve",
    description: "Find upgrades, budget swaps, weak spots, and smarter card choices.",
    accent: "text-violet-200",
    border: "border-violet-400/30",
    glow: "from-violet-500/15 to-transparent",
    links: [
      { href: "/deck/swap-suggestions", label: "Budget Swaps" },
      { href: "/compare-decks", label: "Deck Compare" },
      { href: "/mtg-deck-checker", label: "Deck Checker" },
      { href: "/ai-workshop", label: "AI Workshop" },
    ],
  },
  {
    id: "track",
    title: "Track",
    description: "Manage cards, wishlists, prices, and collection-aware deck choices.",
    accent: "text-amber-200",
    border: "border-amber-400/30",
    glow: "from-amber-500/15 to-transparent",
    links: [
      { href: "/collections", label: "Collections" },
      { href: "/wishlist", label: "Wishlist" },
      { href: "/price-tracker", label: "Price Tracker" },
      { href: "/cards", label: "Card Search" },
    ],
  },
  {
    id: "play",
    title: "Play",
    description: "Tools for live games, testing hands, and quick table decisions.",
    accent: "text-sky-200",
    border: "border-sky-400/30",
    glow: "from-sky-500/15 to-transparent",
    links: [
      { href: "/tools/mulligan", label: "Mulligan Simulator" },
      { href: "/tools/mulligan#probability", label: "Probability Calculator" },
    ],
  },
  {
    id: "discover",
    title: "Discover",
    description: "Explore commanders, archetypes, public decks, and meta movement.",
    accent: "text-rose-200",
    border: "border-rose-400/30",
    glow: "from-rose-500/15 to-transparent",
    links: [
      { href: "/meta", label: "Meta" },
      { href: "/commanders", label: "Commander Guides" },
      { href: "/commander-archetypes", label: "Archetypes" },
      { href: "/decks/browse", label: "Browse Decks" },
    ],
  },
  {
    id: "ai",
    title: "AI",
    description: "Ask rules questions, improve decks, roast lists, and get focused MTG help.",
    accent: "text-fuchsia-200",
    border: "border-fuchsia-400/30",
    glow: "from-fuchsia-500/15 to-transparent",
    links: [
      { href: "/", label: "AI Chat" },
      { href: "/roast", label: "Roast My Deck" },
      { href: "/ai-workshop", label: "AI Workshop" },
    ],
  },
];

export type HomePopularTool = {
  href: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  accent: string;
};

export const HOME_POPULAR_TOOLS: HomePopularTool[] = [
  {
    href: "/build-a-deck",
    title: "Deck Builder",
    subtitle: "Start a Commander or 60-card list with guided help.",
    icon: Wand2,
    accent: "text-amber-200 border-amber-300/25 bg-amber-300/10",
  },
  {
    href: "/deck/swap-suggestions",
    title: "Budget Swaps",
    subtitle: "Find cheaper alternatives without losing the deck's plan.",
    icon: Sparkles,
    accent: "text-emerald-200 border-emerald-300/25 bg-emerald-300/10",
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
    href: "/",
    title: "AI Chat",
    subtitle: "Ask rules questions and get focused MTG help.",
    icon: Bot,
    accent: "text-violet-200 border-violet-300/25 bg-violet-300/10",
  },
];

export const HOME_TRUST_ITEMS = [
  { label: "Deck tools", accent: "text-violet-300" },
  { label: "Budget upgrades", accent: "text-emerald-300" },
  { label: "Collection tracking", accent: "text-sky-300" },
  { label: "AI assistance", accent: "text-fuchsia-300" },
] as const;

export const HOME_HERO_TOOLS = [
  { href: "/mtg-deck-checker", img: "/tool-deck-checker.png", alt: "Deck Checker" },
  { href: "/deck/swap-suggestions", img: "/tool-budget-swaps.png", alt: "Budget Swaps" },
  { href: "/price-tracker", img: "/tool-price-tracker.png", alt: "Price Tracker" },
  { href: "/tools/mulligan", img: "/tool-mulligan-lab.png", alt: "Mulligan Lab" },
  { href: "/build-a-deck", img: "/tool-build-a-deck.png", alt: "Build a Deck" },
] as const;
