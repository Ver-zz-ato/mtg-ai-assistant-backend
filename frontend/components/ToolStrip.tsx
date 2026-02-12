import Link from "next/link";

const TOOLS = [
  { href: "/collections/cost-to-finish", label: "Cost to Finish" },
  { href: "/deck/swap-suggestions", label: "Budget Swaps" },
  { href: "/price-tracker", label: "Price Tracker" },
  { href: "/tools/mulligan", label: "Mulligan Simulator" },
  { href: "/tools/probability", label: "Probability Helpers" },
] as const;

export type ToolStripVariant = "compact" | "full";

interface ToolStripProps {
  variant?: ToolStripVariant;
  currentPath?: string;
  className?: string;
}

export function ToolStrip({
  variant = "compact",
  currentPath,
  className = "",
}: ToolStripProps) {
  const basePath = currentPath?.replace(/\/$/, "") ?? "";
  const isCompact = variant === "compact";

  return (
    <section
      className={`${className}`}
      aria-label="Explore ManaTap Tools"
    >
      <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
        Explore ManaTap Tools
      </div>
      <div
        className={
          isCompact
            ? "flex flex-wrap gap-2"
            : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
        }
      >
        {TOOLS.map(({ href, label }) => {
          const isActive = basePath === href.replace(/\/$/, "");
          return (
            <Link
              key={href}
              href={href}
              className={
                isCompact
                  ? `inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-blue-600/30 text-blue-300 border border-blue-500/50"
                        : "bg-neutral-800/80 text-neutral-300 border border-neutral-700 hover:border-neutral-600 hover:text-neutral-100"
                    }`
                  : `block p-3 rounded-lg border text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-blue-600/20 text-blue-300 border-blue-500/50"
                        : "bg-neutral-800/60 text-neutral-300 border-neutral-700 hover:border-neutral-600 hover:text-neutral-100"
                    }`
              }
            >
              {label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
