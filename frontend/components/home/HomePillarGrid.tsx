import Link from "next/link";
import { HOME_PILLARS } from "@/lib/home/homeConfig";

export default function HomePillarGrid() {
  return (
    <section className="mt-8 sm:mt-9">
      <div className="mb-4">
        <h2 className="text-xl font-black text-white sm:text-2xl">What do you want to do today?</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-neutral-500">
          Browse by workflow — build, improve, track, play, discover, or ask AI.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {HOME_PILLARS.map((pillar) => {
          const Icon = pillar.icon;
          const featured = pillar.featured;

          return (
            <article
              key={pillar.id}
              className={`relative overflow-hidden rounded-xl border bg-[linear-gradient(145deg,rgba(12,12,14,0.95),rgba(8,8,10,0.88))] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-4 ${
                featured
                  ? "border-fuchsia-400/50 bg-[linear-gradient(145deg,rgba(18,10,24,0.96),rgba(10,8,14,0.9))] shadow-[0_0_32px_rgba(192,38,211,0.06)]"
                  : pillar.border
              }`}
            >
              <div
                className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${pillar.glow} blur-2xl`}
              />
              <div className="relative flex items-start gap-2.5">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] ${
                    featured
                      ? "border-fuchsia-300/35 bg-fuchsia-500/15 text-fuchsia-100"
                      : `border-white/10 bg-white/5 ${pillar.accent}`
                  }`}
                >
                  <Icon size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className={`text-lg font-black ${pillar.accent}`}>{pillar.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-neutral-500 sm:text-sm">{pillar.description}</p>
                </div>
              </div>
              <div className="relative mt-3 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
                {pillar.links.map((link) => (
                  <Link
                    key={`${pillar.id}-${link.href}-${link.label}`}
                    href={link.href}
                    className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50 ${link.pillClass}`}
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
