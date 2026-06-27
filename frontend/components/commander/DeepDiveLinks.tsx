/**
 * Deep Dive: resource links plus internal crawl paths.
 */

import Link from "next/link";
import { ARCHETYPES } from "@/lib/data/archetypes";
import { STRATEGIES } from "@/lib/data/strategies";

type Props = {
  commanderSlug: string;
  showCommanderGuides?: boolean;
};

const guideLinkClass =
  "inline-flex rounded-lg border px-3 py-2 text-sm font-medium transition-colors";

export function DeepDiveLinks({ commanderSlug, showCommanderGuides = true }: Props) {
  return (
    <section className="rounded-2xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-950/20 via-neutral-950/60 to-neutral-900/50 p-5 mb-6">
      <h2 className="text-lg font-semibold text-fuchsia-100 mb-4">Deep Dive</h2>
      <p className="text-neutral-400 text-sm mb-4">
        Commander-specific guides and resources.
      </p>
      {showCommanderGuides && (
        <ul className="flex flex-wrap gap-3 mb-4">
          <li>
            <Link
              href={`/commanders/${commanderSlug}/mulligan-guide`}
              className={`${guideLinkClass} border-blue-400/30 bg-blue-950/35 text-blue-200 hover:bg-blue-900/45`}
            >
              Mulligan Guide
            </Link>
          </li>
          <li>
            <Link
              href={`/commanders/${commanderSlug}/budget-upgrades`}
              className={`${guideLinkClass} border-emerald-400/30 bg-emerald-950/35 text-emerald-200 hover:bg-emerald-900/45`}
            >
              Budget Upgrades
            </Link>
          </li>
          <li>
            <Link
              href={`/commanders/${commanderSlug}/best-cards`}
              className={`${guideLinkClass} border-amber-400/30 bg-amber-950/35 text-amber-200 hover:bg-amber-900/45`}
            >
              Best Cards
            </Link>
          </li>
        </ul>
      )}

      <div className={showCommanderGuides ? "pt-4 border-t border-white/10" : ""}>
        <p className="text-neutral-400 text-sm mb-3">Explore archetypes, strategies, and cards:</p>
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
          <Link href="/commander-archetypes" className="text-cyan-300 hover:text-cyan-200 hover:underline">
            Archetypes
          </Link>
          <span className="text-neutral-600">·</span>
          <Link href="/strategies" className="text-cyan-300 hover:text-cyan-200 hover:underline">
            Strategies
          </Link>
          <span className="text-neutral-600">·</span>
          <Link href="/cards" className="text-cyan-300 hover:text-cyan-200 hover:underline">
            Top Cards
          </Link>
          <span className="text-neutral-600">·</span>
          <Link href="/meta" className="text-cyan-300 hover:text-cyan-200 hover:underline">
            Meta
          </Link>
          {ARCHETYPES.slice(0, 4).map((a) => (
            <span key={a.slug}>
              <span className="text-neutral-600"> · </span>
              <Link href={`/commander-archetypes/${a.slug}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">
                {a.title}
              </Link>
            </span>
          ))}
          {STRATEGIES.slice(0, 3).map((s) => (
            <span key={s.slug}>
              <span className="text-neutral-600"> · </span>
              <Link href={`/strategies/${s.slug}`} className="text-cyan-300 hover:text-cyan-200 hover:underline">
                {s.title}
              </Link>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
