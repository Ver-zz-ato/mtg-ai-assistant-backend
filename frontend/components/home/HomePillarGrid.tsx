import Link from "next/link";
import { HOME_PILLARS } from "@/lib/home/homeConfig";

export default function HomePillarGrid() {
  return (
    <section className="mt-10 sm:mt-12">
      <div className="mb-5">
        <h2 className="text-2xl font-black text-white sm:text-3xl">What do you want to do today?</h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400 sm:text-base">
          Pick a workflow — build, improve, track, play, discover, or ask AI.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {HOME_PILLARS.map((pillar) => (
          <article
            key={pillar.id}
            className={`relative overflow-hidden rounded-2xl border bg-[linear-gradient(145deg,rgba(12,12,14,0.95),rgba(8,8,10,0.88))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-5 ${pillar.border}`}
          >
            <div
              className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br ${pillar.glow} blur-2xl`}
            />
            <h3 className={`text-lg font-black ${pillar.accent}`}>{pillar.title}</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-400">{pillar.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {pillar.links.map((link) => (
                <Link
                  key={`${pillar.id}-${link.href}-${link.label}`}
                  href={link.href}
                  className="inline-flex min-h-9 items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-white/20 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
