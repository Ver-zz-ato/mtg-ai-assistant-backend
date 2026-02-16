/**
 * Deep Dive: resource links (Mulligan Guide, Budget Upgrades, Best Cards).
 * Replaces the repeated Strategy Snapshot block at the bottom.
 */

import Link from "next/link";

type Props = {
  commanderSlug: string;
};

export function DeepDiveLinks({ commanderSlug }: Props) {
  return (
    <section className="rounded-xl border border-neutral-700 bg-neutral-800/40 p-5 mb-6">
      <h2 className="text-lg font-semibold text-neutral-100 mb-4">Deep Dive</h2>
      <p className="text-neutral-400 text-sm mb-4">
        Commander-specific guides and resources.
      </p>
      <ul className="flex flex-wrap gap-3">
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
    </section>
  );
}
