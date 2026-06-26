import type { Metadata } from "next";
import Link from "next/link";
import { STRATEGIES } from "@/lib/data/strategies";

const STRATEGY_ART: Record<string, string> = {
  ramp: "https://cards.scryfall.io/art_crop/front/f/3/f3a8f16d-f1e8-4e74-a0ba-80f5b2a20bd3.jpg",
  tokens: "https://cards.scryfall.io/art_crop/front/9/e/9e3c6f4e-708b-4be8-b68a-fb872cc68191.jpg",
  sacrifice: "https://cards.scryfall.io/art_crop/front/8/f/8f672a95-b1c7-4514-a5b5-991def2143d8.jpg",
  control: "https://cards.scryfall.io/art_crop/front/d/1/d18ee91b-c91c-4ecf-8abd-0ff40949e8d9.jpg",
  aggro: "https://cards.scryfall.io/art_crop/front/e/3/e330b3fc-0f54-4835-a931-ad9f760ef045.jpg",
  combo: "https://cards.scryfall.io/art_crop/front/b/a/ba5a871e-872c-4892-ad1c-07de02ae6a0c.jpg",
};

export const metadata: Metadata = {
  title: "Commander Strategies | Ramp, Tokens, Control | ManaTap",
  description:
    "Commander strategy guides: ramp, tokens, sacrifice, control, aggro, combo. Find commanders and tools for each strategy.",
  alternates: { canonical: "https://www.manatap.ai/strategies" },
};

export default function StrategiesIndexPage() {
  return (
    <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="text-neutral-200">
        <nav className="text-sm text-neutral-400 mb-4">
          <Link href="/" className="hover:text-white">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-200">Strategies</span>
        </nav>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-6">
          Commander Strategies
        </h1>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STRATEGIES.map((strategy) => (
            <li key={strategy.slug}>
              <Link
                href={`/strategies/${strategy.slug}`}
                className="group relative block min-h-56 overflow-hidden rounded-xl border border-white/10 bg-neutral-950 transition hover:-translate-y-0.5 hover:border-cyan-300/60"
              >
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-70 transition group-hover:scale-105"
                  style={{ backgroundImage: `url(${STRATEGY_ART[strategy.slug] ?? STRATEGY_ART.ramp})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
                <div className="relative flex h-full min-h-56 flex-col justify-end p-5">
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {strategy.tagMatches.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-cyan-200/30 bg-cyan-200/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h2 className="text-2xl font-black text-white">{strategy.title}</h2>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-neutral-200">
                    {strategy.intro}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </article>
    </main>
  );
}
