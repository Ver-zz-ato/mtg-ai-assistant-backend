"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/http";
import { HOME_COMMUNITY_HIGHLIGHTS } from "@/lib/home/homeConfig";

type MetaStats = {
  ok?: boolean;
  totalDecks?: number;
};

export default function HomeCommunityHighlights() {
  const [publicDecks, setPublicDecks] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson<MetaStats>("/api/meta/trending", { cache: "no-store" });
        if (
          !cancelled &&
          data?.ok &&
          typeof data.totalDecks === "number" &&
          data.totalDecks > 0
        ) {
          setPublicDecks(data.totalDecks);
        }
      } catch {
        // Capability labels only when meta unavailable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-8 sm:mt-9" aria-label="Community highlights">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">
        Community highlights
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {HOME_COMMUNITY_HIGHLIGHTS.map((item) => {
          const Icon = item.icon;
          let text = item.label;
          if (item.statKey === "publicDecks" && publicDecks !== null && item.statLabel) {
            text = `${publicDecks.toLocaleString()} ${item.statLabel}`;
          } else if (item.staticCount != null && item.staticCountSuffix) {
            text = `${item.staticCount.toLocaleString()}+ ${item.staticCountSuffix}`;
          }

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold text-neutral-100 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50 ${item.accent}`}
            >
              <Icon size={14} aria-hidden="true" className="shrink-0 opacity-90" />
              {text}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
