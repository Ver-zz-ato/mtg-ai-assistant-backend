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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {HOME_PILLARS.map((pillar) => {
          const Icon = pillar.icon;
          const featured = pillar.featured;

          return (
            <article
              key={pillar.id}
              className={`relative overflow-hidden rounded-2xl border bg-[linear-gradient(145deg,rgba(12,12,14,0.95),rgba(8,8,10,0.88))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-5 ${
                featured
                  ? "border-fuchsia-400/50 bg-[linear-gradient(145deg,rgba(18,10,24,0.96),rgba(10,8,14,0.9))] shadow-[0_0_40px_rgba(192,38,211,0.08)]"
                  : pillar.border
              }`}
            >
              <div
                className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${pillar.glow} blur-2xl`}
              />
              <div className="relative flex items-start gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] ${
                    featured
                      ? "border-fuchsia-300/35 bg-fuchsia-500/15 text-fuchsia-100"
                      : `border-white/10 bg-white/5 ${pillar.accent}`
                  }`}
                >
                  <Icon size={22} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className={`text-xl font-black ${pillar.accent}`}>{pillar.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-neutral-400">{pillar.description}</p>
                </div>
              </div>
              <div className="relative mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-4">
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
          );
        })}
      </div>
    </section>
  );
}
