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
        className="mx-auto max-w-[920px] px-4 pb-2 pt-10 text-center text-neutral-200 md:pt-14"
        aria-label="About browsing public decks"
      >
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-white md:text-4xl">
          Browse Decks &amp; Precons
        </h1>
        <p className="mx-auto max-w-3xl text-sm leading-7 text-neutral-300 md:text-base">
          Explore community-built Magic decks and official Commander precons. Filter by format,
          colours, commander, and recent activity, then clone any deck to make it your own.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {['Community decks', 'Official precons', 'Clone & edit'].map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-neutral-700 bg-neutral-900/70 px-3 py-1.5 text-xs font-medium text-neutral-300"
            >
              {chip}
            </span>
          ))}
        </div>
        <div className="mx-auto mt-5 max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
          <p className="text-sm leading-6 text-neutral-400">
            Found a list you like? Test opening hands, estimate missing cards, or find cheaper swaps before you build.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
            <Link href="/tools/mulligan" className="text-cyan-400 transition-colors hover:text-cyan-300 hover:underline">
              Mulligan Simulator
            </Link>
            <Link href="/collections/cost-to-finish" className="text-emerald-400 transition-colors hover:text-emerald-300 hover:underline">
              Cost to Finish
            </Link>
            <Link href="/deck/swap-suggestions" className="text-amber-300 transition-colors hover:text-amber-200 hover:underline">
              Budget Swaps
            </Link>
          </div>
        </div>
      </section>
      {children}
    </>
  );
}


































































