/**
 * Meta Tile Grid - Rich navigation tiles for meta dashboard.
 * Each tile: title, description, stat hint, icon, hover animation.
 * SSR-compatible.
 */

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type MetaTile = {
  href: string;
  title: string;
  description: string;
  statHint?: string;
  icon: LucideIcon;
};

type Props = {
  tiles: readonly MetaTile[];
};

export function MetaTileGrid({ tiles }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((tile) => (
        <Link
          key={tile.href}
          href={tile.href}
          className="group block p-5 rounded-xl bg-neutral-800/90 border border-neutral-700 hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-200 hover:scale-[1.02]"
        >
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-neutral-700/80 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors">
              <tile.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-white group-hover:text-blue-300 transition-colors">
                {tile.title}
              </h3>
              <p className="text-neutral-400 text-sm mt-1 line-clamp-2">
                {tile.description}
              </p>
              {tile.statHint && (
                <p className="text-neutral-500 text-xs mt-2">{tile.statHint}</p>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
