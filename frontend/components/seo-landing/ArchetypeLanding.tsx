import Link from "next/link";
import { getArchetypeBySlug } from "@/lib/data/archetypes";
import { CTAPanel } from "./CTAPanel";
import { ExploreLinks } from "./ExploreLinks";

type Props = {
  archetypeSlug: string;
  query: string;
  slug: string;
};

export function ArchetypeLanding({ archetypeSlug, query, slug }: Props) {
  const archetype = getArchetypeBySlug(archetypeSlug);
  const title = archetype?.title ?? archetypeSlug;

  const intro = archetype
    ? archetype.intro
    : `The ${archetypeSlug} archetype is popular in Commander. Browse decks, see top commanders, and use ManaTap's free tools to build and optimize your deck.`;

  return (
    <>
      <div className="text-neutral-300 mb-8 space-y-4 text-lg leading-relaxed">
        {(typeof intro === "string" ? intro.split(/\n\n+/) : [intro]).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <CTAPanel template="archetype" slug={slug} />
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-neutral-100 mb-4">Explore</h2>
        <div className="flex flex-wrap gap-3">
          <Link href={`/commander-archetypes/${archetypeSlug}`} className="text-cyan-400 hover:underline">
            {title} Archetype Hub
          </Link>
          <Link href="/commander-archetypes" className="text-cyan-400 hover:underline">
            All Archetypes
          </Link>
          <Link href={`/decks/browse?search=${encodeURIComponent(archetypeSlug)}`} className="text-cyan-400 hover:underline">
            Browse {title} Decks
          </Link>
        </div>
      </div>
      <ExploreLinks />
    </>
  );
}
