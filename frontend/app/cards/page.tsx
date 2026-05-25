import type { Metadata } from "next";
import Link from "next/link";
import CardSearchCommandCenter from "@/components/cards/CardSearchCommandCenter";
import { getTopCards } from "@/lib/top-cards";

// Force dynamic rendering to avoid DYNAMIC_SERVER_USAGE when served from Vercel suspense cache / ISR
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Top Commander Cards | ManaTap",
  description:
    "Top 200 cards by appearance in public Commander decks. Card pages with oracle text, price, and commanders.",
  alternates: { canonical: "https://www.manatap.ai/cards" },
};

export const revalidate = 86400;

export default async function CardsIndexPage() {
  const cards = await getTopCards().catch(() => []);

  return (
    <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Cards</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
          Top Commander Cards
        </h1>
        <p className="text-neutral-300 mb-4 text-lg leading-relaxed">
          Most-played cards in public Commander decks. Updated daily. Click any card for details, oracle text, and commanders.
        </p>
        <p className="text-neutral-400 mb-6 text-base leading-relaxed max-w-2xl">
          Building a Commander deck starts with knowing which cards the community actually plays. This list ranks the top 200 cards by appearance in public decks on ManaTap. Staples like Sol Ring, Arcane Signet, and Command Tower appear in most lists. Card draw engines, removal, and ramp form the backbone of every deck. Use this hub to discover popular choices, compare deck counts, and find cards that fit your commander&apos;s strategy. Each card page shows oracle text, price data, and which commanders run it most often.
        </p>
        <CardSearchCommandCenter />
        <section className="mt-10">
          <h2 className="text-2xl font-bold text-white">Top Commander Cards</h2>
          <p className="mt-2 text-sm text-neutral-400">Popular public-deck staples remain here for browsing and SEO.</p>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <li key={c.slug} className="rounded-lg border border-white/10 bg-neutral-950/60 px-3 py-2">
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
        </section>
      </article>
    </main>
  );
}
