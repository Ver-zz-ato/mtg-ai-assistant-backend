import type { CommanderPageCommunityProfile } from "@/lib/external-deck-meta/commanderPageProfile";

type Props = {
  profile: CommanderPageCommunityProfile;
};

const averageLabels: Array<{
  key: keyof CommanderPageCommunityProfile["averages"];
  label: string;
}> = [
  { key: "lands", label: "Lands" },
  { key: "ramp", label: "Ramp" },
  { key: "draw", label: "Draw" },
  { key: "removal", label: "Removal" },
  { key: "protection", label: "Protection" },
];

function formatAverage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function CommunityProfileSection({ profile }: Props) {
  const refreshed = formatDate(profile.lastRefreshedAt);

  return (
    <section className="rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-950/25 via-neutral-950/60 to-neutral-900/50 p-5 mb-6 shadow-lg shadow-amber-950/10">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-amber-100">External Community Profile</h2>
          <p className="text-neutral-400 text-sm">
            Based on {profile.approvedSampleSize.toLocaleString()} approved decklists
          </p>
        </div>
        {refreshed && (
          <p className="text-xs text-neutral-500">
            Last refreshed {refreshed}
          </p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-5 mb-4">
        {averageLabels.map((item) => (
          <div key={item.key} className="rounded-xl border border-amber-400/15 bg-black/35 p-3">
            <div className="text-xs uppercase tracking-wide text-neutral-500">{item.label}</div>
            <div className="mt-1 text-xl font-semibold text-amber-200 tabular-nums">
              {formatAverage(profile.averages[item.key])}
            </div>
          </div>
        ))}
      </div>

      {profile.commonCards.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-200 mb-2">Common cards</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {profile.commonCards.map((card, index) => (
              <div
                key={`${card.name}-${index}`}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/30 px-3 py-2.5"
              >
                <span className="shrink-0 w-6 text-center text-neutral-500 text-sm font-medium tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-neutral-200">
                  {card.name}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-neutral-400">
                  {formatPercent(card.inclusionRate)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
