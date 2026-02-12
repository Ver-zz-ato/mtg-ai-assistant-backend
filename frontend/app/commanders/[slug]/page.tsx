import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommanderBySlug, getFirst50CommanderSlugs } from "@/lib/commanders";
import { ARCHETYPES } from "@/lib/data/archetypes";
import { STRATEGIES } from "@/lib/data/strategies";
import {
  renderCommanderIntro,
  deriveCommanderSnapshot,
  renderStrategySnapshot,
} from "@/lib/seo/commander-content";
import { RelatedTools } from "@/components/RelatedTools";
import { ToolStrip } from "@/components/ToolStrip";
import { CommanderArtBanner } from "@/components/CommanderArtBanner";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";
import { getCommanderAggregates } from "@/lib/commander-aggregates";

export async function generateStaticParams() {
  return getFirst50CommanderSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

const BASE = "https://www.manatap.ai";

function breadcrumbJsonLd(slug: string, name: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "Commanders", item: `${BASE}/commanders` },
      { "@type": "ListItem", position: 3, name, item: `${BASE}/commanders/${slug}` },
    ],
  });
}

function webPageJsonLd(slug: string, name: string, description: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${name} Commander Tools`,
    description,
    url: `${BASE}/commanders/${slug}`,
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = getCommanderBySlug(slug);
  if (!profile) return { title: "Commander Not Found | ManaTap AI" };
  return {
    title: `${profile.name} Commander Tools: Mulligan, Cost, Swaps | ManaTap`,
    description: `Tools for ${profile.name} Commander decks: mulligan simulator, cost to finish, budget swaps. Browse ${profile.name} decks. Try ManaTap's free EDH tools.`,
    alternates: { canonical: `${BASE}/commanders/${slug}` },
  };
}

export default async function CommanderHubPage({ params }: Props) {
  const { slug } = await params;
  const profile = getCommanderBySlug(slug);
  if (!profile) notFound();

  const { name } = profile;
  const intro = renderCommanderIntro(profile, "hub");
  const description = `Tools for ${name} Commander decks: mulligan simulator, cost to finish, budget swaps. Browse ${name} decks.`;
  const snapshot = deriveCommanderSnapshot(profile);
  const strategySnapshot = renderStrategySnapshot(profile);

  const browseUrl = `/decks/browse?search=${encodeURIComponent(name)}`;
  const mulliganUrl = `/tools/mulligan?commander=${encodeURIComponent(slug)}`;
  const costUrl = `/collections/cost-to-finish?commander=${encodeURIComponent(slug)}`;
  const swapsUrl = `/deck/swap-suggestions?commander=${encodeURIComponent(slug)}`;

  const cleanName = name.replace(/\s*\(.*?\)\s*$/, "").trim();
  const [imgMap, aggregates] = await Promise.all([
    getImagesForNamesCached([cleanName]),
    getCommanderAggregates(slug),
  ]);
  function norm(s: string) {
    return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  }
  const cmdImg = imgMap.get(norm(cleanName));
  const commanderArt = cmdImg?.art_crop || cmdImg?.normal || cmdImg?.small;

  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd(slug, name) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: webPageJsonLd(slug, name, description) }} />
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/commanders" className="hover:text-white">Commanders</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">{name}</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          {name} Commander Tools
        </h1>
        {commanderArt && (
          <CommanderArtBanner artUrl={commanderArt} name={name} className="mb-6" />
        )}
        <div className="text-neutral-300 mb-8 space-y-4 text-lg leading-relaxed">
          {intro.split(/(?<=\.)\s+/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {/* Commander Snapshot Card */}
        <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-4 mb-6">
          <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider mb-3">Commander Snapshot</h2>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div><span className="text-neutral-500">Gameplan:</span> <span className="text-neutral-200">{snapshot.gameplan}</span></div>
            <div><span className="text-neutral-500">Core themes:</span> <span className="text-neutral-200">{snapshot.themes}</span></div>
            <div><span className="text-neutral-500">Power style:</span> <span className="text-neutral-200">{snapshot.powerStyle}</span></div>
            <div><span className="text-neutral-500">Difficulty:</span> <span className="text-neutral-200">{snapshot.difficulty}</span></div>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-neutral-100 mb-4">Try tools with this commander</h2>
        <div className="grid gap-4 sm:grid-cols-2 mb-6">
          <a
            href={browseUrl}
            className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 hover:bg-neutral-800 transition-colors"
          >
            <h3 className="font-semibold text-white mb-1">Browse Decks</h3>
            <p className="text-sm text-neutral-400">Explore public {name} decks</p>
          </a>
          <a
            href={mulliganUrl}
            className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 hover:bg-neutral-800 transition-colors"
          >
            <h3 className="font-semibold text-white mb-1">Mulligan Simulator</h3>
            <p className="text-sm text-neutral-400">Simulate keep rates for your opener</p>
          </a>
          <a
            href={costUrl}
            className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 hover:bg-neutral-800 transition-colors"
          >
            <h3 className="font-semibold text-white mb-1">Cost to Finish</h3>
            <p className="text-sm text-neutral-400">Estimate cost to complete your deck</p>
          </a>
          <a
            href={swapsUrl}
            className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 hover:bg-neutral-800 transition-colors"
          >
            <h3 className="font-semibold text-white mb-1">Budget Swaps</h3>
            <p className="text-sm text-neutral-400">Find cheaper alternatives</p>
          </a>
        </div>

        <ToolStrip variant="compact" className="mb-8" />

        {aggregates && aggregates.topCards.length > 0 && (
          <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-4 mb-6">
            <h2 className="text-xl font-semibold text-neutral-100 mb-4">Most Played Cards</h2>
            <p className="text-neutral-400 text-sm mb-3">
              Top cards across {aggregates.deckCount} public {name} decks.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 text-sm">
              {aggregates.topCards.slice(0, 12).map((c) => (
                <li key={c.cardName} className="flex justify-between">
                  <span className="text-neutral-200 truncate">{c.cardName}</span>
                  <span className="text-neutral-500 shrink-0 ml-2">{c.percent}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {aggregates && aggregates.medianDeckCost != null && aggregates.medianDeckCost > 0 && (
          <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-4 mb-6">
            <h2 className="text-xl font-semibold text-neutral-100 mb-4">Typical Deck Cost Range</h2>
            <p className="text-neutral-400 text-sm mb-3">
              Based on {aggregates.deckCount} public {name} decks.
            </p>
            <p className="text-neutral-200">
              Median deck cost: ~${Math.round(aggregates.medianDeckCost).toLocaleString()} USD
            </p>
          </div>
        )}

        {aggregates && aggregates.recentDecks.length > 0 && (
          <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-4 mb-6">
            <h2 className="text-xl font-semibold text-neutral-100 mb-4">Recent Decks</h2>
            <p className="text-neutral-400 text-sm mb-3">
              Latest community decks for {name}.
            </p>
            <ul className="space-y-2">
              {aggregates.recentDecks.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/decks/${d.id}`}
                    className="text-blue-400 hover:underline"
                  >
                    {d.title}
                  </Link>
                  <span className="text-neutral-500 text-xs ml-2">
                    {new Date(d.updated_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <h2 className="text-xl font-semibold text-neutral-100 mb-4">Popular decks using this commander</h2>
        <div className="mb-8">
          <p className="text-neutral-400 text-sm mb-3">
            Explore community decks built around {name} to find inspiration and proven lists.
          </p>
          <a
            href={browseUrl}
            className="inline-block px-4 py-2 rounded-lg border border-neutral-600 bg-neutral-800/80 hover:bg-neutral-700 text-blue-400 font-medium"
          >
            Browse {name} decks →
          </a>
        </div>

        <h2 className="text-xl font-semibold text-neutral-100 mb-4">Strategy Snapshot</h2>
        <p className="text-neutral-300 mb-8 leading-relaxed">{strategySnapshot}</p>

        <div className="flex flex-wrap gap-3 text-sm mb-4">
          <Link href={`/commanders/${slug}/mulligan-guide`} className="text-blue-400 hover:underline">Mulligan Guide</Link>
          <Link href={`/commanders/${slug}/budget-upgrades`} className="text-blue-400 hover:underline">Budget Upgrades</Link>
          <Link href={`/commanders/${slug}/best-cards`} className="text-blue-400 hover:underline">Best Cards</Link>
        </div>
        {(() => {
          const tags = new Set((profile.tags ?? []).map((t) => t.toLowerCase()));
          const archetypes = ARCHETYPES.filter((a) => a.tagMatches.some((m) => tags.has(m.toLowerCase())));
          const strategies = STRATEGIES.filter((s) => s.tagMatches.some((m) => tags.has(m.toLowerCase())));
          if (archetypes.length === 0 && strategies.length === 0) return null;
          return (
            <div className="text-sm text-neutral-400 mb-6">
              {archetypes.length > 0 && (
                <p>
                  Archetypes: {archetypes.map((a, i) => (
                    <span key={a.slug}>
                      {i > 0 && ", "}
                      <Link href={`/commander-archetypes/${a.slug}`} className="text-blue-400 hover:underline">{a.title}</Link>
                    </span>
                  ))}
                </p>
              )}
              {strategies.length > 0 && (
                <p>
                  Strategies: {strategies.map((s, i) => (
                    <span key={s.slug}>
                      {i > 0 && ", "}
                      <Link href={`/strategies/${s.slug}`} className="text-blue-400 hover:underline">{s.title}</Link>
                    </span>
                  ))}
                </p>
              )}
            </div>
          );
        })()}
        <RelatedTools
          tools={[
            { href: "/tools/mulligan", label: "Mulligan Simulator" },
            { href: "/collections/cost-to-finish", label: "Cost to Finish" },
            { href: "/deck/swap-suggestions", label: "Budget Swaps" },
            { href: "/tools/probability", label: "Probability Calculator" },
            { href: "/price-tracker", label: "Price Tracker" },
          ]}
        />
      </article>
    </main>
  );
}
