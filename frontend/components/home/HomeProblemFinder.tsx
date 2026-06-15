import Link from "next/link";
import { HOME_PROBLEM_FINDER } from "@/lib/home/homeConfig";

export default function HomeProblemFinder() {
  return (
    <section className="mt-6 sm:mt-8" aria-labelledby="home-problem-finder-heading">
      <div className="mb-5">
        <h2
          id="home-problem-finder-heading"
          className="text-2xl font-black text-white sm:text-3xl"
        >
          What do you need help with today?
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400 sm:text-base">
          Pick a problem and ManaTap will point you to the right tools.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {HOME_PROBLEM_FINDER.map((problem) => {
          const Icon = problem.icon;

          return (
            <article
              key={problem.id}
              className={`group relative overflow-hidden rounded-2xl border bg-[linear-gradient(145deg,rgba(12,12,14,0.95),rgba(8,8,10,0.88))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-5 ${problem.border}`}
            >
              <div
                className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${problem.glow} blur-2xl`}
              />

              <Link
                href={problem.primaryHref}
                className="relative flex min-h-[44px] items-start gap-3 rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-violet-300/50"
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] ${problem.iconShell}`}
                >
                  <Icon size={22} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <h3 className={`text-lg font-black leading-snug ${problem.accent}`}>
                    {problem.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-neutral-400 group-hover:text-neutral-300">
                    {problem.description}
                  </p>
                </span>
              </Link>

              {problem.tools.length > 0 ? (
                <div className="relative mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-4">
                  {problem.tools.map((tool) => (
                    <Link
                      key={`${problem.id}-${tool.href}-${tool.label}`}
                      href={tool.href}
                      className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50 ${problem.toolChipClass}`}
                    >
                      {tool.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
