/**
 * Meta Section Header - Title + optional description for meta list sections.
 * SSR-compatible.
 */

type Props = {
  title: string;
  description?: string;
  stats?: React.ReactNode;
};

export function MetaSectionHeader({ title, description, stats }: Props) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">{title}</h2>
      {description && (
        <p className="text-neutral-400 text-base mb-3 max-w-2xl">{description}</p>
      )}
      {stats && <div className="mt-2">{stats}</div>}
    </div>
  );
}
