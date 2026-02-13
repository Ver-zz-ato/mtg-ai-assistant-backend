/**
 * Primary action block for commander tools.
 * Emphasizes "Start here" flow: Mulligan → Cost to Finish → Budget Swaps → Browse Decks.
 */

import Link from "next/link";

type ToolItem = {
  href: string;
  label: string;
  description: string;
  isRecommended?: boolean;
};

type Props = {
  tools: ToolItem[];
  commanderName: string;
};

export function CommanderToolActions({ tools, commanderName }: Props) {
  return (
    <div className="mb-8">
      <p className="text-neutral-400 text-sm mb-3">
        Start here: Mulligan Simulator (fast) → then Cost to Finish (money) → Budget Swaps (savings)
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`block p-4 rounded-lg border transition-all ${
              t.isRecommended
                ? "bg-blue-950/40 border-blue-600/60 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10"
                : "bg-neutral-800/80 border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800"
            }`}
          >
            <div className="flex items-start gap-2">
              {t.isRecommended && (
                <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-blue-600/80 text-white">
                  Start here
                </span>
              )}
              <div>
                <h3 className="font-semibold text-white mb-1">{t.label}</h3>
                <p className="text-sm text-neutral-400">{t.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <p className="text-neutral-500 text-xs mt-2">No signup required to try tools.</p>
    </div>
  );
}
