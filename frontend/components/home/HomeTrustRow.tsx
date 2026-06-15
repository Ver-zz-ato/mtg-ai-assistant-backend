"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { HOME_TRUST_CAPABILITIES } from "@/lib/home/homeConfig";
import { fetchJson } from "@/lib/http";

type MetaStats = {
  ok?: boolean;
  totalDecks?: number;
};

export default function HomeTrustRow() {
  const [publicDecks, setPublicDecks] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson<MetaStats>("/api/meta/trending", { cache: "no-store" });
        if (!cancelled && data?.ok && typeof data.totalDecks === "number" && data.totalDecks > 0) {
          setPublicDecks(data.totalDecks);
        }
      } catch {
        // Capability-only trust row when metrics unavailable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-10 pb-8 sm:mt-12">
      <div className="rounded-2xl border border-white/10 bg-neutral-950/50 p-5 sm:p-6">
        <h2 className="text-lg font-black text-white sm:text-xl">Built for real MTG workflows</h2>
        {publicDecks !== null ? (
          <p className="mt-1 text-sm text-neutral-400">
            Tracking {publicDecks.toLocaleString()} public decks in the community meta feed.
          </p>
        ) : (
          <p className="mt-1 text-sm text-neutral-400">
            Deck building, upgrades, collections, discovery, and AI — in one companion.
          </p>
        )}
        <ul className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {HOME_TRUST_CAPABILITIES.map((item) => (
            <li
              key={item.label}
              className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm font-semibold text-neutral-200"
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 ${item.accent}`}>
                <Check size={14} aria-hidden="true" />
              </span>
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
