/**
 * Hero section: 2-column layout (desktop), stacked (mobile).
 * Left: commander art + compact stats row.
 * Right: H2 "How X Wins" + win plan bullets + primary/secondary CTAs.
 */

import Link from "next/link";
import { CommanderArtBanner } from "@/components/CommanderArtBanner";
import { CommanderStatsRow } from "./CommanderStatsRow";
import type { CommanderStatsRowData } from "./CommanderStatsRow";

type Props = {
  commanderName: string;
  commanderSlug: string;
  artUrl: string | null;
  statsData: CommanderStatsRowData;
  winPlanBullets: string[];
  mulliganUrl: string;
  costUrl: string;
  browseUrl: string;
  swapsUrl: string;
};

export function CommanderHero({
  commanderName,
  commanderSlug,
  artUrl,
  statsData,
  winPlanBullets,
  mulliganUrl,
  costUrl,
  browseUrl,
  swapsUrl,
}: Props) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mb-8">
      {/* Left column: art + stats */}
      <div className="space-y-4">
        {artUrl && (
          <CommanderArtBanner
            artUrl={artUrl}
            name={commanderName}
            className="mb-4"
          />
        )}
        <CommanderStatsRow data={statsData} />
      </div>

      {/* Right column: How X Wins + CTAs */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white">
          How {commanderName} Wins
        </h2>
        <ul className="space-y-2 text-neutral-300 text-sm">
          {winPlanBullets.map((bullet, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-cyan-500 shrink-0">•</span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            href={mulliganUrl}
            className="inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-500 border-2 border-blue-500/50 shadow-lg shadow-blue-500/20 transition-all"
          >
            Simulate Mulligans
          </Link>
          <Link
            href={costUrl}
            className="inline-flex items-center justify-center px-5 py-3 rounded-lg font-medium text-white bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 transition-colors"
          >
            Estimate Cost to Finish
          </Link>
        </div>

        <p className="text-xs text-neutral-500">No signup required to try tools.</p>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href={browseUrl}
            className="text-blue-400 hover:text-blue-300 hover:underline"
          >
            Browse Community Decks
          </Link>
          <Link
            href={swapsUrl}
            className="text-blue-400 hover:text-blue-300 hover:underline"
          >
            Find Budget Swaps
          </Link>
        </div>
      </div>
    </section>
  );
}
