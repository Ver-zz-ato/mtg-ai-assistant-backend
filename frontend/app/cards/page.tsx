import type { Metadata } from "next";
import Link from "next/link";
import { getTopCards } from "@/lib/top-cards";

export const metadata: Metadata = {
  title: "Top Commander Cards | ManaTap",
  description:
    "Top 200 cards by appearance in public Commander decks. Card pages with oracle text, price, and commanders.",
  alternates: { canonical: "https://www.manatap.ai/cards" },
};

export const revalidate = 86400;

export default async function CardsIndexPage() {
  const cards = await getTopCards();

  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Cards</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
          Top Commander Cards
        </h1>
        <p className="text-neutral-300 mb-8 text-lg leading-relaxed">
          Most-played cards in public Commander decks. Updated daily. Click any card for details, oracle text, and commanders.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {cards.map((c) => (
            <li key={c.slug}>
              <Link href={`/cards/${c.slug}`} className="text-blue-400 hover:underline">
                {c.card_name}
              </Link>
              <span className="text-neutral-500 text-sm ml-2">({c.deck_count})</span>
            </li>
          ))}
        </ul>
        {cards.length === 0 && (
          <p className="text-neutral-400">No cards yet. Run the top-cards cron to populate.</p>
        )}
      </article>
    </main>
  );
}
