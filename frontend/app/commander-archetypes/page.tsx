import type { Metadata } from "next";
import Link from "next/link";
import { ARCHETYPES } from "@/lib/data/archetypes";

export const metadata: Metadata = {
  title: "Commander Archetypes | Dragon, Tokens, Aristocrats | ManaTap",
  description:
    "Commander archetype guides: dragons, tokens, aristocrats, spellslinger, elfball, and more. Find commanders and tools for each archetype.",
  alternates: { canonical: "https://www.manatap.ai/commander-archetypes" },
};

export default function ArchetypesIndexPage() {
  return (
    <main className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Archetypes</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
          Commander Archetypes
        </h1>
        <p className="text-neutral-300 mb-8 text-lg leading-relaxed">
          Explore Commander archetypes—from dragon tribal to enchantress. Each archetype has commanders, strategy tips, and links to our free tools.
        </p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ARCHETYPES.map((a) => (
            <li key={a.slug}>
              <Link
                href={`/commander-archetypes/${a.slug}`}
                className="block p-4 rounded-lg bg-neutral-800/80 border border-neutral-700 hover:border-blue-600 transition-colors"
              >
                <h2 className="font-semibold text-white">{a.title}</h2>
                <p className="text-sm text-neutral-400 mt-1">{a.intro.slice(0, 120)}...</p>
              </Link>
            </li>
          ))}
        </ul>
      </article>
    </main>
  );
}
