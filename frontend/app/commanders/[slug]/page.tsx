import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  commanderSlugToName,
  getAllCommanderSlugs,
} from "@/lib/commander-slugs";

export async function generateStaticParams() {
  return getAllCommanderSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const name = commanderSlugToName(slug);
  if (!name) return { title: "Commander Not Found | ManaTap AI" };
  return {
    title: `${name} Commander Tools | Mulligan, Cost, Swaps | ManaTap AI`,
    description: `Tools for ${name} Commander decks: mulligan simulator, probability calculator, cost to finish, budget swaps. Browse ${name} decks. ManaTap AI.`,
    alternates: {
      canonical: `https://www.manatap.ai/commanders/${slug}`,
    },
  };
}

export default async function CommanderHubPage({ params }: Props) {
  const { slug } = await params;
  const name = commanderSlugToName(slug);
  if (!name) notFound();

  const browseUrl = `/decks/browse?search=${encodeURIComponent(name)}`;
  const mulliganUrl = "/tools/mulligan";
  const costUrl = "/collections/cost-to-finish";
  const swapsUrl = "/deck/swap-suggestions";

  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="text-neutral-200">
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
          {name} Commander Tools
        </h1>
        <p className="text-neutral-300 mb-6 text-lg">
          Use these tools to build and optimize your {name} Commander deck. Browse community decks,
          simulate mulligans, calculate draw odds, estimate cost to finish, and find budget swaps.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href={browseUrl}
            className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 hover:bg-neutral-800 transition-colors"
          >
            <h2 className="font-semibold text-white mb-1">Browse Decks</h2>
            <p className="text-sm text-neutral-400">
              Explore public {name} decks for inspiration
            </p>
          </Link>
          <Link
            href={mulliganUrl}
            className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 hover:bg-neutral-800 transition-colors"
          >
            <h2 className="font-semibold text-white mb-1">Mulligan Simulator</h2>
            <p className="text-sm text-neutral-400">
              Simulate keep rates for your opener
            </p>
          </Link>
          <Link
            href={costUrl}
            className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 hover:bg-neutral-800 transition-colors"
          >
            <h2 className="font-semibold text-white mb-1">Cost to Finish</h2>
            <p className="text-sm text-neutral-400">
              Estimate cost to complete your deck
            </p>
          </Link>
          <Link
            href={swapsUrl}
            className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 hover:bg-neutral-800 transition-colors"
          >
            <h2 className="font-semibold text-white mb-1">Budget Swaps</h2>
            <p className="text-sm text-neutral-400">
              Find cheaper alternatives for expensive cards
            </p>
          </Link>
        </div>
      </article>
    </main>
  );
}
