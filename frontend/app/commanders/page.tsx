import type { Metadata } from "next";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { COMMANDERS, getRecentlyUpdatedCommanders } from "@/lib/commanders";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { MetaLayout } from "@/components/meta/MetaLayout";
import { CommanderCard } from "@/components/meta/CommanderCard";

export const metadata: Metadata = {
  title: "Commander Tools & Guides | Mulligan, Cost, Budget | ManaTap",
  description:
    "Commander-specific tools and guides. Mulligan strategy, budget upgrades, best cards. Browse 50+ commanders. Free EDH tools from ManaTap.",
  alternates: { canonical: "https://www.manatap.ai/commanders" },
};

const BASE = "https://www.manatap.ai";

function breadcrumbJsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      {
        "@type": "ListItem",
        position: 2,
        name: "Commanders",
        item: `${BASE}/commanders`,
      },
    ],
  });
}

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function CommandersIndexPage() {
  const [recentUpdates, imageMap] = await Promise.all([
    getRecentlyUpdatedCommanders(8),
    getImagesForNamesCached(COMMANDERS.map((c) => c.name)),
  ]);

  return (
    <MetaLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd() }}
      />
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-6">
          <Link href="/" className="hover:text-white">
            Home
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Commanders</span>
        </nav>

        {/* Hero */}
        <section className="mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Commander Tools & Guides
          </h1>
          <p className="text-neutral-300 text-lg leading-relaxed max-w-2xl">
            Mulligan simulator, cost-to-finish calculator, budget swaps, and
            deck browser for each commander. In-depth guides on strategy and best
            cards. All SSR, indexable. No signup required.
          </p>
        </section>

        {/* Recently Updated - more visually distinct */}
        {recentUpdates.length > 0 && (
          <section className="mb-10 rounded-xl border border-neutral-600 bg-neutral-700/50 p-6">
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw className="w-5 h-5 text-blue-400 shrink-0" />
              <h2 className="text-lg font-semibold text-neutral-100">
                Recently Updated
              </h2>
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Updated
              </span>
            </div>
            <p className="text-neutral-400 text-sm mb-4">
              Commanders with fresh deck data and guides.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {recentUpdates.map(({ slug, name, updated_at }) => (
                <li key={slug}>
                  <Link
                    href={`/commanders/${slug}`}
                    className="flex items-center justify-between gap-2 p-3 rounded-lg bg-neutral-800/80 hover:bg-neutral-700/80 border border-transparent hover:border-neutral-600 transition-colors"
                  >
                    <span className="text-blue-400 hover:text-blue-300 font-medium truncate">
                      {name}
                    </span>
                    <span className="text-neutral-500 text-xs shrink-0">
                      {new Date(updated_at).toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Commander Directory Grid */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-6">
            Commander Directory
          </h2>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {COMMANDERS.map((c) => {
              const img = imageMap.get(norm(c.name));
              const url = img?.art_crop ?? img?.normal ?? img?.small;
              return (
                <CommanderCard
                  key={c.slug}
                  item={{ name: c.name, slug: c.slug }}
                  imageUrl={url}
                />
              );
            })}
          </div>
        </section>
      </article>
    </MetaLayout>
  );
}
