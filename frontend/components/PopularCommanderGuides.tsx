"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchCommanderArtBatch } from "@/lib/commander-art-batch";
import { FLAGSHIP_COMMANDER_GUIDES } from "@/lib/home/commanderGuides";
import { HOME_COMMANDER_GUIDE_COUNT } from "@/lib/home/commanderGuideCount";

interface CommanderGuide {
  slug: string;
  name: string;
  colors: string;
}

const FLAGSHIP_STRIP: CommanderGuide[] = FLAGSHIP_COMMANDER_GUIDES.map(
  ({ slug, name, colors }) => ({ slug, name, colors }),
);

const COLOR_STYLES: Record<string, string> = {
  W: "bg-amber-100 text-amber-900 border-amber-300",
  U: "bg-blue-500 text-white border-blue-400",
  B: "bg-neutral-800 text-neutral-200 border-neutral-600",
  R: "bg-red-600 text-white border-red-500",
  G: "bg-green-600 text-white border-green-500",
};

function ColorPips({ colors }: { colors: string }) {
  if (!colors) return null;
  return (
    <span className="inline-flex gap-0.5">
      {colors.split("").map((c, i) => (
        <span
          key={i}
          className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-bold ${COLOR_STYLES[c] || "bg-gray-500"}`}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

function GuideCard({
  cmd,
  art,
  loading,
}: {
  cmd: CommanderGuide;
  art?: string;
  loading: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-800/80 transition-all duration-200 hover:border-neutral-600">
      <Link
        href={`/commanders/${cmd.slug}`}
        className="relative block h-20 overflow-hidden bg-neutral-800 transition-opacity hover:opacity-90"
      >
        {loading ? (
          <div className="h-full w-full animate-pulse bg-neutral-700" />
        ) : art ? (
          <img src={art} alt={cmd.name} className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-700 to-neutral-800 text-2xl text-neutral-500">
            🃏
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/70 to-transparent" />
      </Link>

      <div className="relative z-10 -mt-6 flex flex-1 flex-col p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <Link
            href={`/commanders/${cmd.slug}`}
            className="flex-1 truncate text-sm font-bold text-white transition-colors hover:text-cyan-300"
            title={cmd.name}
          >
            {cmd.name.split(",")[0]}
          </Link>
          <ColorPips colors={cmd.colors} />
        </div>

        <div className="mt-auto flex flex-wrap gap-1.5">
          <Link
            href={`/commanders/${cmd.slug}/best-cards`}
            className="rounded-full bg-violet-600/80 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-violet-500"
          >
            Best Cards
          </Link>
          <Link
            href={`/commanders/${cmd.slug}/budget-upgrades`}
            className="rounded-full bg-emerald-600/80 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-emerald-500"
          >
            Budget
          </Link>
          <Link
            href={`/commanders/${cmd.slug}/mulligan-guide`}
            className="rounded-full bg-amber-600/80 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-amber-500"
          >
            Mulligan
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PopularCommanderGuides({ embedded = false }: { embedded?: boolean }) {
  const [artMap, setArtMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const commanders = useMemo(() => FLAGSHIP_STRIP, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchArt() {
      const map = await fetchCommanderArtBatch(commanders.map((cmd) => cmd.name));
      if (!cancelled) {
        setArtMap(map);
        setLoading(false);
      }
    }
    fetchArt();
    return () => {
      cancelled = true;
    };
  }, [commanders]);

  return (
    <section
      className={
        embedded ? "pt-1" : "mx-auto max-w-[1600px] border-t border-neutral-800 px-4 py-4"
      }
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-200">📚 Popular Commander Guides</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Best cards, budget upgrades & mulligan strategy for top commanders
          </p>
        </div>
        <Link
          href="/commanders"
          className="shrink-0 text-sm font-medium text-cyan-400 transition-colors hover:text-cyan-300"
        >
          View all {HOME_COMMANDER_GUIDE_COUNT}+ guides →
        </Link>
      </div>

      {embedded ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {commanders.map((cmd) => (
            <GuideCard key={cmd.slug} cmd={cmd} art={artMap[cmd.name]} loading={loading} />
          ))}
        </div>
      ) : (
        <div className="relative min-w-0 overflow-hidden">
          <div
            className="-mx-1 flex gap-3 overflow-x-auto overflow-y-hidden px-1 pb-2 custom-scrollbar"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {commanders.map((cmd) => (
              <div key={cmd.slug} className="w-48 min-w-[12rem] shrink-0">
                <GuideCard cmd={cmd} art={artMap[cmd.name]} loading={loading} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
