// components/SourceReceipts.tsx
// Shared component to display AI response source attribution
import { type ChatSource } from '@/lib/chat/enhancements';

type SourceReceiptsProps = {
  sources: ChatSource[];
};

export default function SourceReceipts({ sources }: SourceReceiptsProps) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px] opacity-60">
      <span>Sources:</span>
      {sources.map((source, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-1 py-[1px] rounded border border-neutral-700 bg-neutral-900"
        >
          <span>{source.icon}</span>
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {source.name}
            </a>
          ) : (
            <span>{source.name}</span>
          )}
          {source.date && <span className="opacity-60">({source.date})</span>}
        </span>
      ))}
    </div>
  );
}
