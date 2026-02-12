import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Browse Magic: The Gathering Decks | ManaTap AI',
  description: 'Explore thousands of community-built MTG decks. Filter by format, colors, and strategy. Find inspiration for Commander, Modern, Standard, and more.',
  keywords: ['MTG decks', 'Magic deck browser', 'Commander decks', 'MTG deck library', 'deck builder', 'MTG community'],
  openGraph: {
    title: 'Browse MTG Decks | ManaTap AI',
    description: 'Explore thousands of community MTG decks. Find your next Commander, Modern, or Standard deck!',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Browse MTG Decks | ManaTap AI',
    description: 'Explore thousands of community MTG decks.',
  },
};

export default function BrowseDecksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <section
        className="mb-6 max-w-4xl mx-auto px-4 text-neutral-200"
        aria-label="About browsing public decks"
      >
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-4">
          Browse Public Commander Decks
        </h1>
        <p className="text-neutral-300 mb-4">
          Explore thousands of community-built Magic: The Gathering decks shared
          by ManaTap users. Filter by format (Commander, Modern, Standard, and
          more), color identity, and sort by recent, popular, or budget
          friendly. Each deck page shows the full list, mana curve, playstyle
          profile, and color breakdown.
        </p>
        <p className="text-neutral-300 mb-4">
          Found a deck you like? Use our tools to analyze and optimize it. Run
          the <Link href="/tools/mulligan" className="text-cyan-400 hover:underline">Mulligan Simulator</Link> to
          see keep rates for your opener, check the <Link href="/collections/cost-to-finish" className="text-cyan-400 hover:underline">Cost to Finish</Link> to
          estimate how much it costs to build, or try <Link href="/deck/swap-suggestions" className="text-cyan-400 hover:underline">Budget Swaps</Link> to
          find cheaper alternatives for expensive cards.
        </p>
        <p className="text-neutral-300">
          Clone any public deck to your account to edit and build on it. Sign in
          to save your favorites and share your own builds with the community.
        </p>
      </section>
      {children}
    </>
  );
}


































































