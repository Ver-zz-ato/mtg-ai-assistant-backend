"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { openChatPrompt } from "@/lib/navigation/chatRoute";
import {
  costAuditClientLog,
  costAuditRequestId,
  isCostAuditClientEnabled,
} from "@/lib/observability/cost-audit";
import { formatMetaFreshnessPill, type MetaLabelPayload } from "@/lib/meta/freshness";
import { fetchJson } from "@/lib/http";
import { fetchCommanderArtBatch } from "@/lib/commander-art-batch";

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

export function TrendingCommandersStrip({ mode = "chat" }: { mode?: "chat" | "marketing" }) {
  const [commanders, setCommanders] = useState<TrendingCommander[]>([]);
  const [artMap, setArtMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [labelPayload, setLabelPayload] = useState<MetaLabelPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchTrending() {
      const session = isCostAuditClientEnabled() ? costAuditRequestId() : "";
      const t0 = Date.now();
      if (isCostAuditClientEnabled()) {
        costAuditClientLog({
          event: "client.meta.trending_start",
          component: "TrendingCommandersStrip",
          session,
          path: "/api/meta/trending?window=today",
        });
      }
      try {
        const data = await fetchJson<TrendingResponse>("/api/meta/trending?window=today", {
          cache: "no-store",
        });
        if (isCostAuditClientEnabled()) {
          costAuditClientLog({
            event: "client.meta.trending_done",
            component: "TrendingCommandersStrip",
            session,
            durationMs: Date.now() - t0,
            ok: !!data?.ok,
            status: 200,
            commanderRows: Array.isArray(data?.topCommanders) ? data.topCommanders.length : 0,
          });
        }
        if (!cancelled && data?.ok && Array.isArray(data.topCommanders)) {
          const list = data.topCommanders.slice(0, 12);
          setCommanders(list);
          setLastUpdated(data.lastUpdated ?? null);
          setLabelPayload(data.labelPayload ?? null);
          const tArt = Date.now();
          const map = await fetchCommanderArtBatch(list.map((cmd) => cmd.name));
          if (isCostAuditClientEnabled()) {
            costAuditClientLog({
              event: "client.commander_art.batch_done",
              component: "TrendingCommandersStrip",
              session,
              durationMs: Date.now() - tArt,
              artRequests: 1,
              artHits: Object.keys(map).length,
            });
          }
          if (!cancelled) setArtMap(map);
        }
      } catch {
        if (isCostAuditClientEnabled()) {
          costAuditClientLog({
            event: "client.meta.trending_done",
            component: "TrendingCommandersStrip",
            session,
            durationMs: Date.now() - t0,
            ok: false,
            err: "exception",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchTrending();
    return () => {
      cancelled = true;
    };
  }, []);

  const freshness = useMemo(
    () => formatMetaFreshnessPill(lastUpdated, labelPayload),
    [lastUpdated, labelPayload]
  );

  function handleAnalyze(name: string, slug?: string) {
    if (mode === "marketing") {
      if (slug) {
        window.location.assign(`/commanders/${slug}`);
      } else {
        window.location.assign(`/build-a-deck`);
      }
      return;
    }
    const message = `Build a Commander deck for ${name}`;
    openChatPrompt(message, { autoSubmit: true });
  }

  if (loading) {
    return (
      <section
        className="max-w-[1600px] mx-auto px-4 pt-4 pb-2"
        aria-label="Trending commanders"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-200">
              Commander Meta Movers
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Loading the latest meta snapshot.
            </p>
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="shrink-0 w-44 h-28 rounded-lg bg-neutral-800/60 animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  if (commanders.length === 0) {
    return null;
  }

  return (
    <section
      className="max-w-[1600px] mx-auto px-4 pt-4 pb-2"
      aria-labelledby="trending-commanders-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3">
        <div>
          <h2
            id="trending-commanders-heading"
            className="text-lg font-semibold text-neutral-200"
          >
            Commander Meta Movers
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {freshness ?? "Latest commander movement from the shared meta feed."}
          </p>
        </div>
        <Link
          href="/meta/trending-commanders"
          className="text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors shrink-0"
        >
          View commander meta →
        </Link>
      </div>

      <div className="relative min-w-0 overflow-hidden">
        <div
          className="flex gap-3 overflow-x-auto overflow-y-hidden pb-2 -mx-1 px-1 custom-scrollbar"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {commanders.map((cmd) => (
            <div
              key={cmd.name}
              className="shrink-0 w-52 min-w-[13rem] rounded-lg bg-neutral-800/80 border border-neutral-700 hover:bg-neutral-700/90 hover:border-neutral-600 transition-all duration-200 overflow-hidden flex flex-col"
            >
              {cmd.slug ? (
                <Link
                  href={`/commanders/${cmd.slug}`}
                  className="block h-20 bg-neutral-800 relative overflow-hidden hover:opacity-90 transition-opacity"
                >
                  {artMap[cmd.name] ? (
                    <img
                      src={artMap[cmd.name]}
                      alt={cmd.name}
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-neutral-500 text-2xl">
                      Card
                    </div>
                  )}
                </Link>
              ) : (
                <div className="h-20 bg-neutral-800 relative overflow-hidden">
                  {artMap[cmd.name] ? (
                    <img
                      src={artMap[cmd.name]}
                      alt={cmd.name}
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-neutral-500 text-2xl">
                      Card
                    </div>
                  )}
                </div>
              )}
              <div className="p-3 flex flex-col flex-1">
                <div className="mb-2">
                  {cmd.slug ? (
                    <Link
                      href={`/commanders/${cmd.slug}`}
                      className="block font-bold text-white text-[1.02rem] leading-5 min-h-[2.5rem] break-words hover:text-cyan-300 transition-colors"
                    >
                      {cmd.name}
                    </Link>
                  ) : (
                    <span className="block font-bold text-white text-[1.02rem] leading-5 min-h-[2.5rem] break-words">
                      {cmd.name}
                    </span>
                  )}
                </div>
                <div className="mt-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleAnalyze(cmd.name, cmd.slug)}
                    className="flex-1 px-3 py-1.5 text-xs font-medium bg-neutral-600 hover:bg-neutral-500 text-white rounded-md transition-colors"
                  >
                    {mode === "marketing" ? "View commander" : "Analyze this commander"}
                  </button>
                  {cmd.slug ? (
                    <Link
                      href={`/commanders/${cmd.slug}`}
                      className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white border border-neutral-600 hover:border-neutral-500 rounded-md transition-all duration-200 shrink-0"
                    >
                      View
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
