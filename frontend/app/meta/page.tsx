import type { Metadata } from "next";
import Link from "next/link";
import { META_SLUGS, getMetaTitle } from "@/lib/meta-signals";

export const metadata: Metadata = {
  title: "Meta | Trending Commanders & Cards | ManaTap",
  description:
    "Discover trending commanders, most-played cards, and budget commanders. Based on public deck data. Updated daily.",
  alternates: { canonical: "https://www.manatap.ai/meta" },
};

export default function MetaIndexPage() {
  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Meta</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">Meta</h1>
        <p className="text-neutral-300 mb-8 text-lg leading-relaxed">
          Discover what the community is playing. These pages are refreshed daily from public deck data.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {META_SLUGS.map((slug) => (
            <li key={slug}>
              <Link
                href={`/meta/${slug}`}
                className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 transition-colors"
              >
                <h2 className="font-semibold text-white">{getMetaTitle(slug)}</h2>
              </Link>
            </li>
          ))}
        </ul>
      </article>
    </main>
  );
}
