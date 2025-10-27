import { Metadata } from 'next';

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
  return children;
}








































