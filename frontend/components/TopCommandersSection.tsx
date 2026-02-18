/**
 * Server-rendered "Popular Commanders" section for homepage SEO.
 * Plain <a href> links for crawlability — key pages within 2 clicks of homepage.
 */
import { COMMANDERS } from "@/lib/commanders";

const DISPLAY_COUNT = 30;

export function TopCommandersSection() {
  const commanders = COMMANDERS.slice(0, DISPLAY_COUNT);
  return (
    <section className="max-w-[1600px] mx-auto px-4 py-6" aria-labelledby="popular-commanders-heading">
      <h2 id="popular-commanders-heading" className="text-lg font-semibold text-neutral-200 mb-3">
        Popular Commanders
      </h2>
      <p className="text-sm text-neutral-400 mb-4">
        Commander-specific tools: mulligan simulator, budget swaps, best cards. Browse guides for each commander.
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-2">
        {commanders.map((c) => (
          <a
            key={c.slug}
            href={`/commanders/${c.slug}`}
            className="text-blue-400 hover:text-blue-300 hover:underline text-sm"
          >
            {c.name}
          </a>
        ))}
        <a href="/commanders" className="text-blue-400 hover:text-blue-300 hover:underline text-sm font-medium">
          View all commanders →
        </a>
      </div>
    </section>
  );
}
