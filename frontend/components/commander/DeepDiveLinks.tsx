/**
 * Deep Dive: resource links (Mulligan Guide, Budget Upgrades, Best Cards).
 * Plus internal links to archetypes, strategies, cards for SEO crawl.
 */

import Link from "next/link";
import { ARCHETYPES } from "@/lib/data/archetypes";
import { STRATEGIES } from "@/lib/data/strategies";

type Props = {
  commanderSlug: string;
  showCommanderGuides?: boolean;
};

export function DeepDiveLinks({ commanderSlug, showCommanderGuides = true }: Props) {
  return (
    <section className="rounded-xl border border-neutral-700 bg-neutral-800/40 p-5 mb-6">
      <h2 className="text-lg font-semibold text-neutral-100 mb-4">Deep Dive</h2>
      <p className="text-neutral-400 text-sm mb-4">
        Commander-specific guides and resources.
      </p>
      {showCommanderGuides && (
        <ul className="flex flex-wrap gap-3 mb-4">
          <li>
            <Link
              href={`/commanders/${commanderSlug}/mulligan-guide`}
              className="text-blue-400 hover:underline"
            >
              Mulligan Guide
            </Link>
          </li>
          <li>
            <Link
              href={`/commanders/${commanderSlug}/budget-upgrades`}
              className="text-blue-400 hover:underline"
            >
              Budget Upgrades
            </Link>
          </li>
          <li>
            <Link
              href={`/commanders/${commanderSlug}/best-cards`}
              className="text-blue-400 hover:underline"
            >
              Best Cards
            </Link>
          </li>
        </ul>
      )}

      <div className={showCommanderGuides ? "pt-4 border-t border-neutral-700" : ""}>
        <p className="text-neutral-400 text-sm mb-3">Explore archetypes, strategies, and cards:</p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/commander-archetypes" className="text-blue-400 hover:underline">
            Archetypes
          </Link>
          <span className="text-neutral-600">·</span>
          <Link href="/strategies" className="text-blue-400 hover:underline">
            Strategies
          </Link>
          <span className="text-neutral-600">·</span>
          <Link href="/cards" className="text-blue-400 hover:underline">
            Top Cards
          </Link>
          <span className="text-neutral-600">·</span>
          <Link href="/meta" className="text-blue-400 hover:underline">
            Meta
          </Link>
          {ARCHETYPES.slice(0, 4).map((a) => (
            <span key={a.slug}>
              <span className="text-neutral-600">·</span>
              <Link href={`/commander-archetypes/${a.slug}`} className="text-blue-400 hover:underline">
                {a.title}
              </Link>
            </span>
          ))}
          {STRATEGIES.slice(0, 3).map((s) => (
            <span key={s.slug}>
              <span className="text-neutral-600">·</span>
              <Link href={`/strategies/${s.slug}`} className="text-blue-400 hover:underline">
                {s.title}
              </Link>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
