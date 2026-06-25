"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type HomeMetaSpotlightItem = {
  kind: "commander" | "card";
  name: string;
  href: string;
  imageUrl?: string | null;
  metaLabel: string;
  description: string;
};

const ROTATE_MS = 5000;

export default function HomeMetaMoverRotatorClient({
  items,
  freshness,
}: {
  items: HomeMetaSpotlightItem[];
  freshness: string | null;
}) {
  const [index, setIndex] = useState(0);
  const active = items[index % Math.max(items.length, 1)];

  useEffect(() => {
    if (items.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [items.length]);

  if (!active) return null;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-fuchsia-400/25 bg-neutral-950/50 p-4 shadow-[0_0_32px_rgba(192,38,211,0.06)] sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300/90">
            Meta spotlight
          </p>
          <h3 className="mt-1 text-lg font-bold text-neutral-100 sm:text-xl">
            Popular cards & commanders
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            {freshness ?? "ManaTap and external EDHREC-order popularity signals."}
          </p>
        </div>
        <Link
          href="/meta"
          className="shrink-0 text-xs font-semibold text-fuchsia-300 transition hover:text-fuchsia-200"
        >
          View meta -&gt;
        </Link>
      </div>

      <Link
        href={active.href}
        className="group relative mt-1 flex min-h-[240px] flex-1 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/80 transition hover:border-fuchsia-400/40 sm:min-h-[280px]"
      >
        {active.imageUrl ? (
          <img
            src={active.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[center_15%] transition duration-700 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 bg-neutral-800" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-transparent" />
        <div className="relative flex h-full w-full flex-col justify-end p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {items.map((item, i) => (
              <button
                key={`${item.kind}:${item.name}`}
                type="button"
                aria-label={`Show ${item.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIndex(i);
                }}
                className={`h-1.5 rounded-full transition-all ${
                  i === index % items.length
                    ? "w-6 bg-fuchsia-300"
                    : "w-1.5 bg-white/25 hover:bg-white/40"
                }`}
              />
            ))}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fuchsia-300/90">
            {active.kind === "commander" ? "Popular commander" : "Popular card"} - {active.metaLabel}
          </p>
          <h4 className="mt-1 text-xl font-black text-white transition group-hover:text-fuchsia-100 sm:text-2xl">
            {active.name}
          </h4>
          <p className="mt-2 text-sm text-neutral-300">{active.description}</p>
          <span className="mt-3 text-sm font-semibold text-fuchsia-300 group-hover:text-fuchsia-200">
            Explore {active.kind} -&gt;
          </span>
        </div>
      </Link>
    </div>
  );
}
