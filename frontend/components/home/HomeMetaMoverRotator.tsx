"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchCommanderArtBatch } from "@/lib/commander-art-batch";
import { formatMetaFreshnessPill, type MetaLabelPayload } from "@/lib/meta/freshness";
import { fetchJson } from "@/lib/http";

type TrendingCommander = {
  name: string;
  count: number;
  slug?: string;
};

type TrendingResponse = {
  ok?: boolean;
  topCommanders?: TrendingCommander[];
  lastUpdated?: string | null;
  labelPayload?: MetaLabelPayload | null;
};

const ROTATE_MS = 6000;

export default function HomeMetaMoverRotator() {
  const [commanders, setCommanders] = useState<TrendingCommander[]>([]);
  const [artMap, setArtMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [labelPayload, setLabelPayload] = useState<MetaLabelPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson<TrendingResponse>("/api/meta/trending?window=today", {
          cache: "no-store",
        });
        if (!cancelled && data?.ok && Array.isArray(data.topCommanders)) {
          const list = data.topCommanders.slice(0, 8);
          setCommanders(list);
          setLastUpdated(data.lastUpdated ?? null);
          setLabelPayload(data.labelPayload ?? null);
          const map = await fetchCommanderArtBatch(list.map((cmd) => cmd.name));
          if (!cancelled) setArtMap(map);
        }
      } catch {
        // Optional spotlight when meta unavailable
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (commanders.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % commanders.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [commanders.length]);

  const freshness = useMemo(
    () => formatMetaFreshnessPill(lastUpdated, labelPayload),
    [lastUpdated, labelPayload],
  );

  const active = commanders[index % Math.max(commanders.length, 1)];
  const art = active ? artMap[active.name] : undefined;
  const href = active?.slug
    ? `/commanders/${active.slug}`
    : active
      ? `/decks/browse?search=${encodeURIComponent(active.name)}`
      : "/meta/trending-commanders";

  if (!loading && commanders.length === 0) {
    return null;
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-fuchsia-400/25 bg-neutral-950/50 p-4 shadow-[0_0_32px_rgba(192,38,211,0.06)] sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300/90">
            Meta movers
          </p>
          <h3 className="mt-1 text-lg font-bold text-neutral-100 sm:text-xl">Commander trends</h3>
          <p className="mt-1 text-sm text-neutral-500">
            {freshness ?? "Leaders climbing in the shared Commander meta feed."}
          </p>
        </div>
        <Link
          href="/meta/trending-commanders"
          className="shrink-0 text-xs font-semibold text-fuchsia-300 transition hover:text-fuchsia-200"
        >
          View meta →
        </Link>
      </div>

      {loading || !active ? (
        <div className="min-h-[240px] animate-pulse rounded-xl bg-neutral-800/80 sm:min-h-[280px]" />
      ) : (
        <Link
          href={href}
          className="group relative mt-1 flex min-h-[240px] flex-1 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/80 transition hover:border-fuchsia-400/40 sm:min-h-[280px]"
        >
          {art ? (
            <img
              src={art}
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
              {commanders.map((cmd, i) => (
                <button
                  key={cmd.name}
                  type="button"
                  aria-label={`Show ${cmd.name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIndex(i);
                  }}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index % commanders.length
                      ? "w-6 bg-fuchsia-300"
                      : "w-1.5 bg-white/25 hover:bg-white/40"
                  }`}
                />
              ))}
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-fuchsia-300/90">
              Trending now
            </p>
            <h4 className="mt-1 text-xl font-black text-white transition group-hover:text-fuchsia-100 sm:text-2xl">
              {active.name}
            </h4>
            <p className="mt-2 text-sm text-neutral-300">
              See decks, guides, and upgrades for this commander.
            </p>
            <span className="mt-3 text-sm font-semibold text-fuchsia-300 group-hover:text-fuchsia-200">
              View commander →
            </span>
          </div>
        </Link>
      )}
    </div>
  );
}
