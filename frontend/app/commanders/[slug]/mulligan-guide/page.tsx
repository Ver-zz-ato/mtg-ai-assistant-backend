import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommanderBySlug, getFirst50CommanderSlugs } from "@/lib/commanders";
import {
  renderMulliganGuideContent,
  MULLIGAN_FAQ,
} from "@/lib/seo/commander-content";
import { RelatedTools } from "@/components/RelatedTools";
import { CommanderArtBanner } from "@/components/CommanderArtBanner";
import { getImagesForNamesCached } from "@/lib/server/scryfallCache";

export async function generateStaticParams() {
  return getFirst50CommanderSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

const BASE = "https://www.manatap.ai";

function faqJsonLd(slug: string, name: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: MULLIGAN_FAQ.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  });
}

function breadcrumbJsonLd(slug: string, name: string) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE },
      { "@type": "ListItem", position: 2, name: "Commanders", item: `${BASE}/commanders` },
      { "@type": "ListItem", position: 3, name, item: `${BASE}/commanders/${slug}` },
      { "@type": "ListItem", position: 4, name: "Mulligan Guide", item: `${BASE}/commanders/${slug}/mulligan-guide` },
    ],
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = getCommanderBySlug(slug);
  if (!profile) return { title: "Not Found | ManaTap" };
  return {
    title: `How to Mulligan ${profile.name} | Commander Guide | ManaTap`,
    description: `Mulligan strategy for ${profile.name} Commander. London mulligan rules, land requirements, when to keep or ship. Use the ManaTap mulligan simulator.`,
    alternates: { canonical: `${BASE}/commanders/${slug}/mulligan-guide` },
  };
}

export default async function MulliganGuidePage({ params }: Props) {
  const { slug } = await params;
  const profile = getCommanderBySlug(slug);
  if (!profile) notFound();

  const { name } = profile;
  const content = renderMulliganGuideContent(profile);

  const cleanName = name.replace(/\s*\(.*?\)\s*$/, "").trim();
  const imgMap = await getImagesForNamesCached([cleanName]);
  function norm(s: string) {
    return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  }
  const cmdImg = imgMap.get(norm(cleanName));
  const commanderArt = cmdImg?.art_crop || cmdImg?.normal || cmdImg?.small;

  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd(slug, name) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd(slug, name) }} />
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/commanders" className="hover:text-white">Commanders</Link>
          <span className="mx-2">/</span>
          <Link href={`/commanders/${slug}`} className="hover:text-white">{name}</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Mulligan Guide</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          How to Mulligan {name}
        </h1>
        {commanderArt && (
          <CommanderArtBanner artUrl={commanderArt} name={name} subtitle="Mulligan Guide" className="mb-6" />
        )}
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            href={`/decks/browse?search=${encodeURIComponent(name)}`}
            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg"
          >
            Browse {name} decks →
          </Link>
          <Link
            href={`/tools/mulligan?commander=${encodeURIComponent(slug)}`}
            className="inline-block px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white font-semibold rounded-lg"
          >
            Mulligan Simulator →
          </Link>
          <Link
            href={`/collections/cost-to-finish?commander=${encodeURIComponent(slug)}`}
            className="inline-block px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white font-semibold rounded-lg"
          >
            Cost to Finish →
          </Link>
        </div>
        <p className="text-neutral-500 text-sm mb-6">No signup required to try tools.</p>
        <div className="space-y-6 text-neutral-300 leading-relaxed">
          {content.map((block, i) => (
            <section key={i}>
              {block.heading && (
                <h2 className="text-xl font-semibold text-neutral-100 mb-3">{block.heading}</h2>
              )}
              <p>{block.body}</p>
            </section>
          ))}
        </div>
        <h2 className="text-xl font-semibold text-neutral-100 mt-10 mb-3">FAQ</h2>
        <dl className="space-y-3 text-neutral-300">
          {MULLIGAN_FAQ.map(({ q, a }) => (
            <div key={q}>
              <dt className="font-medium text-neutral-100">{q}</dt>
              <dd className="ml-0 mt-1 text-sm">{a}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/decks/browse?search=${encodeURIComponent(name)}`}
            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg"
          >
            Browse {name} decks →
          </Link>
          <Link
            href={`/tools/mulligan?commander=${encodeURIComponent(slug)}`}
            className="inline-block px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white font-semibold rounded-lg"
          >
            Mulligan Simulator →
          </Link>
          <Link
            href={`/collections/cost-to-finish?commander=${encodeURIComponent(slug)}`}
            className="inline-block px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white font-semibold rounded-lg"
          >
            Cost to Finish →
          </Link>
        </div>
        <p className="text-neutral-500 text-sm mt-3">No signup required to try tools.</p>
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
