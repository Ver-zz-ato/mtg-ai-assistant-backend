import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArchetypeBySlug, getAllArchetypeSlugs, getCommandersByArchetype } from "@/lib/archetypes";

const BASE = "https://www.manatap.ai";

function faqJsonLd(questions: Array<{ q: string; a: string }>) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  });
}

export async function generateStaticParams() {
  return getAllArchetypeSlugs().map((slug) => ({ slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const archetype = getArchetypeBySlug(slug);
  if (!archetype) return { title: "Archetype Not Found | ManaTap AI" };
  return {
    title: `${archetype.title} Commander Decks | ManaTap`,
    description: `Commander decks for the ${archetype.title} archetype. Mulligan simulator, cost to finish, budget swaps. Free EDH tools.`,
    alternates: { canonical: `${BASE}/commander-archetypes/${slug}` },
  };
}

export default async function ArchetypePage({ params }: Props) {
  const { slug } = await params;
  const archetype = getArchetypeBySlug(slug);
  if (!archetype) notFound();

  const commanders = await getCommandersByArchetype(slug);

  const faqs = [
    {
      q: `What is the ${archetype.title} archetype in Commander?`,
      a: archetype.intro.slice(0, 200) + "...",
    },
    {
      q: `Which commanders work best for ${archetype.title}?`,
      a: `Popular ${archetype.title} commanders include ${commanders.slice(0, 3).map((c) => c.name).join(", ")}. Use ManaTap's mulligan simulator and cost-to-finish tools to optimize your deck.`,
    },
    {
      q: `How do I build a ${archetype.title} Commander deck?`,
      a: `Focus on cards that support the archetype's core strategy. Use the budget swap tool to find cheaper alternatives and the mulligan simulator to test your opener.`,
    },
  ];

  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd(faqs) }} />
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/commander-archetypes" className="hover:text-white">Archetypes</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">{archetype.title}</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          {archetype.title} Commander Decks
        </h1>
        <div className="text-neutral-300 mb-8 space-y-4 text-lg leading-relaxed">
          {archetype.intro.split(/\n\n+/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {commanders.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-neutral-100 mb-4">Commanders</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {commanders.map((c) => (
                <li key={c.slug}>
                  <Link href={`/commanders/${c.slug}`} className="text-blue-400 hover:underline">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <h2 className="text-xl font-semibold text-neutral-100 mb-4">Related Tools</h2>
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <Link
            href="/tools/mulligan"
            className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 transition-colors"
          >
            <h3 className="font-semibold text-white mb-1">Mulligan Simulator</h3>
            <p className="text-sm text-neutral-400">Test your opener</p>
          </Link>
          <Link
            href="/collections/cost-to-finish"
            className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 transition-colors"
          >
            <h3 className="font-semibold text-white mb-1">Cost to Finish</h3>
            <p className="text-sm text-neutral-400">Estimate deck cost</p>
          </Link>
          <Link
            href="/deck/swap-suggestions"
            className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 transition-colors"
          >
            <h3 className="font-semibold text-white mb-1">Budget Swaps</h3>
            <p className="text-sm text-neutral-400">Find cheaper alternatives</p>
          </Link>
        </div>

        <Link href="/commander-archetypes" className="text-blue-400 hover:underline">
          Browse all archetypes
        </Link>
      </article>
    </main>
  );
}
