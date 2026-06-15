import Link from "next/link";
import { PILL_BASE_CLASS, pillClassAt } from "@/lib/ui/accentPills";

export type RelatedTool = { href: string; label: string; pillClass?: string };

interface RelatedToolsProps {
  tools: RelatedTool[];
  variant?: "link" | "pill";
  className?: string;
}

export function RelatedTools({ tools, variant = "link", className = "" }: RelatedToolsProps) {
  if (tools.length === 0) return null;
  return (
    <section
      className={`mt-6 pt-5 border-t border-neutral-800 ${className}`}
      aria-label="Related tools"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400 mb-3">
        Related Tools
      </h2>
      <ul className="flex flex-wrap gap-2">
        {tools.map(({ href, label, pillClass }, i) => (
          <li key={href}>
            {variant === "pill" ? (
              <Link
                href={href}
                className={`${PILL_BASE_CLASS} ${pillClass ?? pillClassAt(i)}`}
              >
                {label}
              </Link>
            ) : (
              <Link
                href={href}
                className="text-blue-400 hover:text-blue-300 hover:underline text-sm"
              >
                {label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
