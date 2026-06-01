import { Database, Globe2, Layers3, RefreshCw } from "lucide-react";
import type { MetaSourceSummary } from "@/lib/meta/sourceSummary";
import { formatRelative } from "@/lib/meta/getMetaSnapshot";

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "Active";
}

type Props = {
  summary: MetaSourceSummary;
  compact?: boolean;
};

export function MetaSourceCallout({ summary, compact = false }: Props) {
  const refreshed = summary.lastUpdated ? formatRelative(summary.lastUpdated) : null;
  const externalRows =
    (summary.globalCommanderRows ?? 0) +
    (summary.globalCardRows ?? 0) +
    (summary.budgetCardRows ?? 0);

  const items = [
    {
      icon: Database,
      label: "ManaTap deck sample",
      value: `${formatNumber(summary.publicCommanderDecks)} public Commander decks`,
    },
    {
      icon: Globe2,
      label: "Global commander signal",
      value: `${formatNumber(summary.globalCommanderRows)} EDHREC-order commanders`,
    },
    {
      icon: Layers3,
      label: "Global card signal",
      value: `${formatNumber(summary.globalCardRows)} staples + ${formatNumber(summary.budgetCardRows)} budget cards`,
    },
    {
      icon: RefreshCw,
      label: "Refresh",
      value: refreshed
        ? `${refreshed}${summary.snapshotDate ? ` (${summary.snapshotDate})` : ""}`
        : "Daily meta job",
    },
  ];

  return (
    <section className={`rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] ${compact ? "p-4" : "p-5"}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Blended meta sources</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-300">
            ManaTap blends public Commander deck activity with Scryfall&apos;s EDHREC-ordered global rankings, price data, and recent-set signals.
          </p>
        </div>
        {externalRows > 0 ? (
          <span className="w-fit rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
            {externalRows.toLocaleString()} external rows
          </span>
        ) : null}
      </div>
      <div className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-4"}`}>
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/80">
              <Icon className="h-4 w-4" />
              {label}
            </div>
            <div className="mt-2 text-sm font-medium text-neutral-100">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
