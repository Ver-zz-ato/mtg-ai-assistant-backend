"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CardDetailLink from "@/components/cards/CardDetailLink";
import { useHoverPreview } from "@/components/shared/HoverPreview";
import { PILL_BASE_CLASS, pillClassAt } from "@/lib/ui/accentPills";

export type RotatorCommander = {
  name: string;
  slug: string;
  artUrl?: string | null;
  previewUrl?: string | null;
  hasGuide?: boolean;
};

const ROTATE_MS = 5000;

export function PopularCommandersRotator({ commanders }: { commanders: RotatorCommander[] }) {
  const [index, setIndex] = useState(0);
  const { preview, bind } = useHoverPreview();
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
      <div className="relative h-[8.5rem]">
        {commanders.map((commander, i) => {
          const className = `${PILL_BASE_CLASS} ${pillClassAt(i)} absolute left-0 top-0 w-full max-w-full gap-4 px-5 py-4 pr-6 text-base shadow-xl shadow-black/30 transition-all duration-500 ${
            i === index
              ? "z-10 translate-y-0 opacity-100"
              : "pointer-events-none z-0 -translate-y-0.5 opacity-0"
          }`;
          const content = (
            <>
              {commander.artUrl ? (
                <img
                  src={commander.artUrl}
                  alt=""
                  className="h-24 w-16 shrink-0 rounded-lg object-cover object-top"
                  {...bind(commander.previewUrl || commander.artUrl)}
                />
              ) : (
                <span className="h-24 w-16 shrink-0 rounded-lg bg-neutral-800/80" aria-hidden />
              )}
              <span className="truncate">{commander.name}</span>
            </>
          );

          return commander.hasGuide ? (
            <Link
              key={commander.slug}
              href={`/commanders/${commander.slug}`}
              className={className}
            >
              {content}
            </Link>
          ) : (
            <CardDetailLink
              key={commander.slug}
              cardName={commander.name}
              imageNormal={commander.artUrl ?? undefined}
              className={`${className} text-left`}
            >
              {content}
            </CardDetailLink>
          );
        })}
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
                  {...bind(commander.previewUrl || commander.artUrl)}
                />
              ) : (
                <span className="block h-8 w-6 bg-neutral-800" aria-hidden />
              )}
            </button>
          ))}
        </div>
      ) : null}
      {preview}
    </div>
  );
}
