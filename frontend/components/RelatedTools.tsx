import Link from "next/link";

export type RelatedTool = { href: string; label: string };

interface RelatedToolsProps {
  tools: RelatedTool[];
}

export function RelatedTools({ tools }: RelatedToolsProps) {
  if (tools.length === 0) return null;
  return (
    <section
      className="mt-8 pt-6 border-t border-neutral-700"
      aria-label="Related tools"
    >
      <h2 className="text-lg font-semibold text-neutral-100 mb-3">
        Related Tools
      </h2>
      <ul className="flex flex-wrap gap-3">
        {tools.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              className="text-blue-400 hover:text-blue-300 hover:underline text-sm"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
