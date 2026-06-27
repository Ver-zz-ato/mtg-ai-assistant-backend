/**
 * Hero section: premium art-backed guide header with compact stats and actions.
 */

import Link from "next/link";
import { buildChatDraftUrl } from "@/lib/navigation/chatRoute";
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
  artUrl,
  statsData,
  winPlanBullets,
  browseUrl,
  swapsUrl,
}: Props) {
  const builderUrl = `/build-a-deck?commander=${encodeURIComponent(commanderName)}#builder`;
  const chatUrl = buildChatDraftUrl(`Tell me about the ${commanderName} commander?`);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-cyan-950/30 via-neutral-950/80 to-fuchsia-950/25 p-4 sm:p-5 lg:p-6 mb-8 shadow-2xl shadow-cyan-950/20">
      {artUrl && (
        <div
          className="absolute inset-0 opacity-20 bg-cover bg-center"
          style={{ backgroundImage: `url(${artUrl})` }}
          aria-hidden="true"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/70" aria-hidden="true" />

      <div className="relative grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6 lg:gap-8">
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

        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">
            Flagship commander guide
          </p>
          <h2 className="text-2xl font-bold text-white">
            How {commanderName} Wins
          </h2>
          <ul className="space-y-2 text-neutral-200 text-sm">
            {winPlanBullets.map((bullet, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-cyan-300 shrink-0">•</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link
              href={chatUrl}
              className="inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 border border-cyan-300/40 shadow-lg shadow-cyan-500/20 transition-all"
            >
              Ask ManaTap about this card
            </Link>
            <Link
              href={builderUrl}
              className="inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-amber-600/90 to-fuchsia-600/90 hover:from-amber-500 hover:to-fuchsia-500 border border-amber-300/30 transition-colors"
            >
              Build a deck with this
            </Link>
          </div>

          <p className="text-xs text-neutral-500">No signup required to try tools.</p>

          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href={browseUrl}
              className="text-cyan-300 hover:text-cyan-200 hover:underline"
            >
              Browse Community Decks
            </Link>
            <Link
              href={swapsUrl}
              className="text-amber-300 hover:text-amber-200 hover:underline"
            >
              Find Budget Swaps
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
