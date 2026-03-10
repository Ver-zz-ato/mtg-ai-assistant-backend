import type { Metadata } from "next";
import Link from "next/link";
import { ARCHETYPES } from "@/lib/data/archetypes";
import ArchetypeCard from "./ArchetypeCard";

// Scryfall art_crop URLs for iconic cards per archetype (art via Scryfall)
const ARCHETYPE_ART: Record<string, { url: string; gradient: string }> = {
  dragons: { url: "https://cards.scryfall.io/art_crop/front/1/0/10d42b35-844f-4a64-9981-c6118d45e826.jpg?1689999317", gradient: "from-amber-900 via-red-900 to-orange-900" },
  aristocrats: { url: "https://cards.scryfall.io/art_crop/front/c/d/cd14f1ce-7fcd-485c-b7ca-01c5b45fdc01.jpg?1689999296", gradient: "from-slate-800 via-neutral-800 to-stone-900" },
  treasure: { url: "https://cards.scryfall.io/art_crop/front/9/e/9e2e3efb-75cb-430f-b9f4-cb58f3aeb91b.jpg?1727093692", gradient: "from-amber-800 via-yellow-900 to-orange-900" },
  spellslinger: { url: "https://cards.scryfall.io/art_crop/front/8/2/82f949d0-41a0-4491-9057-bfb2bb20bdb3.jpg?1689999174", gradient: "from-blue-900 via-indigo-900 to-purple-900" },
  elfball: { url: "https://cards.scryfall.io/art_crop/front/2/7/276f5cee-a501-4658-bd4d-7a044bf1ccbc.jpg?1743204520", gradient: "from-green-900 via-emerald-900 to-teal-900" },
  tokens: { url: "https://cards.scryfall.io/art_crop/front/b/9/b91dadcb-31e9-43b0-b425-c9311af3e9d7.jpg?1599708272", gradient: "from-green-800 via-lime-900 to-emerald-900" },
  sacrifice: { url: "https://cards.scryfall.io/art_crop/front/6/0/607c1793-8e5a-4ebf-87c6-7f9c99bbd29a.jpg?1752944988", gradient: "from-red-900 via-rose-900 to-neutral-900" },
  reanimator: { url: "https://cards.scryfall.io/art_crop/front/3/6/368b6903-5fc4-43e7-bd44-46b8107c8bb4.jpg?1738000013", gradient: "from-neutral-900 via-slate-900 to-black" },
  artifacts: { url: "https://cards.scryfall.io/art_crop/front/7/b/7b7a348a-51f7-4dc5-8fe7-1c70fea5e050.jpg?1761053659", gradient: "from-cyan-900 via-blue-900 to-indigo-900" },
  enchantress: { url: "https://cards.scryfall.io/art_crop/front/8/9/89511ab5-8ea6-4f07-a80b-c1ec7e89924e.jpg?1690005342", gradient: "from-green-800 via-teal-900 to-emerald-900" },
};

export const metadata: Metadata = {
  title: "Commander Archetypes | Dragon, Tokens, Aristocrats | ManaTap",
  description:
    "Commander archetype guides: dragons, tokens, aristocrats, spellslinger, elfball, and more. Find commanders and tools for each archetype.",
  alternates: { canonical: "https://www.manatap.ai/commander-archetypes" },
};

export default function ArchetypesIndexPage() {
  return (
    <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Archetypes</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
          Commander Archetypes
        </h1>
        <p className="text-neutral-300 mb-10 text-lg leading-relaxed">
          Explore Commander archetypes—from dragon tribal to enchantress. Each archetype has commanders, strategy tips, and links to our free tools.
        </p>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
          {ARCHETYPES.map((a) => (
            <li key={a.slug}>
              <ArchetypeCard
                archetype={a}
                imageUrl={ARCHETYPE_ART[a.slug]?.url}
                gradient={ARCHETYPE_ART[a.slug]?.gradient ?? "from-neutral-700 to-neutral-800"}
              />
            </li>
          ))}
        </ul>
      </article>
    </main>
  );
}
