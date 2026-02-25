/**
 * Server-rendered "Popular Commanders" section for homepage SEO.
 * Horizontal scrollable chip row — key pages within 2 clicks of homepage.
 */
import { COMMANDERS } from "@/lib/commanders";

const DISPLAY_COUNT = 30;

export function TopCommandersSection() {
  const commanders = COMMANDERS.slice(0, DISPLAY_COUNT);
  return (
    <section className="max-w-[1600px] mx-auto px-4 py-6" aria-labelledby="popular-commanders-heading">
      <h2 id="popular-commanders-heading" className="text-lg font-semibold text-neutral-200 mb-2">
        Popular Commanders
      </h2>
      <p className="text-sm text-neutral-400 mb-4">
        Commander-specific tools: mulligan simulator, budget swaps, best cards. Browse guides for each commander.
      </p>
      <div className="relative">
        {/* Left edge fade */}
        <div
          className="absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none shrink-0"
          style={{
            background: "linear-gradient(to right, rgb(17 24 39) 0%, transparent 100%)",
          }}
          aria-hidden
        />
        {/* Right edge fade */}
        <div
          className="absolute right-0 top-0 bottom-0 w-12 z-10 pointer-events-none shrink-0"
          style={{
            background: "linear-gradient(to left, rgb(17 24 39) 0%, transparent 100%)",
          }}
          aria-hidden
        />
        <div
          className="flex gap-2 overflow-x-auto overflow-y-hidden pb-2 -mx-1 px-1 pr-12 snap-x snap-mandatory scroll-smooth scrollbar-hide"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {commanders.map((c) => (
            <a
              key={c.slug}
              href={`/commanders/${c.slug}`}
              className="shrink-0 px-4 py-2 rounded-full text-sm font-medium text-blue-400 bg-neutral-800/80 border border-neutral-700 hover:bg-neutral-700 hover:text-blue-300 hover:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-neutral-900 snap-start transition-colors"
            >
              {c.name}
            </a>
          ))}
          <a
            href="/commanders"
            className="shrink-0 px-4 py-2 rounded-full text-sm font-semibold text-cyan-400 bg-neutral-700/90 border border-cyan-500/30 hover:bg-neutral-600 hover:text-cyan-300 hover:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-neutral-900 snap-start transition-colors"
          >
            View all commanders →
          </a>
        </div>
      </div>
    </section>
  );
}
