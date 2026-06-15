"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PILL_BASE_CLASS, pillClassAt } from "@/lib/ui/accentPills";

export type RotatorCommander = {
  name: string;
  slug: string;
  artUrl?: string | null;
};

const ROTATE_MS = 5000;

export function PopularCommandersRotator({ commanders }: { commanders: RotatorCommander[] }) {
  const [index, setIndex] = useState(0);
  const count = commanders.length;

  useEffect(() => {
    if (count <= 1) return;
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % count);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [count]);

  if (count === 0) return null;

  return (
    <div className="space-y-2">
      <div className="relative h-10">
        {commanders.map((commander, i) => (
          <Link
            key={commander.slug}
            href={`/commanders/${commander.slug}`}
            className={`${PILL_BASE_CLASS} ${pillClassAt(i)} absolute left-0 top-0 max-w-full gap-2 pr-3 transition-all duration-500 ${
              i === index
                ? "z-10 translate-y-0 opacity-100"
                : "pointer-events-none z-0 -translate-y-0.5 opacity-0"
            }`}
          >
            {commander.artUrl ? (
              <img
                src={commander.artUrl}
                alt=""
                className="h-8 w-6 shrink-0 rounded object-cover object-top"
              />
            ) : (
              <span className="h-8 w-6 shrink-0 rounded bg-neutral-800/80" aria-hidden />
            )}
            <span className="truncate">{commander.name}</span>
          </Link>
        ))}
      </div>
      {count > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Popular commanders">
          {commanders.map((commander, i) => (
            <button
              key={commander.slug}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={commander.name}
              onClick={() => setIndex(i)}
              className={`overflow-hidden rounded border transition ${
                i === index
                  ? "border-white/35 ring-1 ring-white/15"
                  : "border-transparent opacity-55 hover:opacity-90"
              }`}
            >
              {commander.artUrl ? (
                <img
                  src={commander.artUrl}
                  alt=""
                  className="h-8 w-6 object-cover object-top"
                />
              ) : (
                <span className="block h-8 w-6 bg-neutral-800" aria-hidden />
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
