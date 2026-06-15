"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchCommanderArtBatch } from "@/lib/commander-art-batch";
import { FLAGSHIP_COMMANDER_GUIDES } from "@/lib/home/commanderGuides";

const ROTATE_MS = 6000;

export default function HomeCommanderGuideRotator() {
  const [index, setIndex] = useState(0);
  const [artMap, setArtMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const guides = FLAGSHIP_COMMANDER_GUIDES;
  const active = guides[index % guides.length];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = await fetchCommanderArtBatch(guides.map((g) => g.name));
      if (!cancelled) {
        setArtMap(map);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guides]);

  useEffect(() => {
    if (guides.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % guides.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [guides.length]);

  if (!active) return null;

  const art = artMap[active.name];

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-neutral-950/40 p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-neutral-200">Commander guides</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Best cards, budget upgrades, and mulligan tips for popular leaders.
          </p>
        </div>
        <Link
          href="/commanders"
          className="shrink-0 text-xs font-semibold text-cyan-400 transition hover:text-cyan-300"
        >
          All guides →
        </Link>
      </div>

      <Link
        href={`/commanders/${active.slug}`}
        className="group relative mt-1 flex min-h-[168px] flex-1 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/80 transition hover:border-cyan-400/35"
      >
        {loading ? (
          <div className="absolute inset-0 animate-pulse bg-neutral-800" />
        ) : art ? (
          <img
            src={art}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-top opacity-55 transition duration-500 group-hover:opacity-65"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/70 to-black/40" />
        <div className="relative flex h-full w-full flex-col justify-end p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {guides.map((guide, i) => (
              <button
                key={guide.slug}
                type="button"
                aria-label={`Show ${guide.name} guide`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIndex(i);
                }}
                className={`h-1.5 rounded-full transition-all ${
                  i === index % guides.length
                    ? "w-6 bg-cyan-300"
                    : "w-1.5 bg-white/25 hover:bg-white/40"
                }`}
              />
            ))}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/90">
            Featured guide
          </p>
          <h4 className="mt-1 text-xl font-black text-white transition group-hover:text-cyan-100">
            {active.name}
          </h4>
          <p className="mt-2 max-w-md text-sm leading-6 text-neutral-300">{active.coverage}</p>
          <span className="mt-3 text-sm font-semibold text-cyan-300 group-hover:text-cyan-200">
            Open guide →
          </span>
        </div>
      </Link>
    </div>
  );
}
