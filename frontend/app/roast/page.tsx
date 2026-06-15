import type { Metadata } from "next";
import DeckRoastPanel from "@/components/DeckRoastPanel";
import { canonicalMeta } from "@/lib/seo/metadata";

export function generateMetadata(): Metadata {
  return canonicalMeta("/roast", {
    title: "Roast My Deck | ManaTap AI",
    description:
      "Paste a Magic: The Gathering decklist and get a funny AI roast. Pick your spice level, share the permalink, and send it to your playgroup.",
  });
}

export default function RoastPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/90">Limited · table talk</p>
        <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">Roast My Deck</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400 sm:text-base">
          Paste a list, pick your spice level, and get a shareable roast permalink.
        </p>
      </div>
      <DeckRoastPanel variant="inline" showSignupCta sharePath="/roast" useModal={false} defaultExpanded />
    </main>
  );
}
