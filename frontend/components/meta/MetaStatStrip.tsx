/**
 * Meta Stat Strip - Small stats row (decks analyzed, last updated, data source).
 * SSR-compatible.
 */

type Stat = {
  label: string;
  value: string;
};

type Props = {
  stats: Stat[];
};

export function MetaStatStrip({ stats }: Props) {
  if (stats.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-400">
      {stats.map((s, i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="text-neutral-500">{s.label}:</span>
          <span className="text-neutral-300 font-medium">{s.value}</span>
        </span>
      ))}
    </div>
  );
}
